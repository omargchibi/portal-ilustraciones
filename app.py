from flask import Flask, request, send_file, jsonify, render_template
import os
import io
import json
import logging
import fitz  # PyMuPDF
from PIL import Image
from cachetools import TTLCache

# Configuración de Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuración y Variables de Entorno
TARGET_BYTES = 1_000_000  # ~1 MB
MIN_QUALITY = 40
MAX_DIMENSION = 2000

# Secretos y credenciales (se leen desde variables de entorno de Hugging Face)
API_SECRET = os.environ.get("API_SECRET", "bc0b5bcf2b3ca739d427e480823cfa775165efb6d28bc3ca06edcffe94adfbb4")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "")
GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")

# Caché en memoria para los datos de Google Sheets (TTL: 1 hora, max 1 item ya que solo almacenamos la lista completa)
sheets_cache = TTLCache(maxsize=10, ttl=3600)

# Inicializar clientes de Google API
google_auth_error = None
sheets_service = None
drive_service = None

def get_google_services():
    global sheets_service, drive_service, google_auth_error
    if sheets_service and drive_service:
        return sheets_service, drive_service, None

    if not GOOGLE_CREDENTIALS_JSON:
        err_msg = "GOOGLE_CREDENTIALS_JSON no está configurado en las variables de entorno."
        logger.error(err_msg)
        return None, None, err_msg

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly"
        ]
        credentials = service_account.Credentials.from_service_account_info(creds_info, scopes=scopes)
        
        sheets_service = build("sheets", "v4", credentials=credentials)
        drive_service = build("drive", "v3", credentials=credentials)
        
        logger.info("Clientes de Google Sheets y Google Drive inicializados con éxito.")
        google_auth_error = None
        return sheets_service, drive_service, None
    except Exception as e:
        google_auth_error = f"Error al inicializar servicios de Google: {str(e)}"
        logger.error(google_auth_error)
        return None, None, google_auth_error

# --- LÓGICA DE CONVERSIÓN DE IMÁGENES ---

def comprimir_a_objetivo(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    if max(img.size) > MAX_DIMENSION:
        ratio = MAX_DIMENSION / max(img.size)
        nuevo_tamano = (int(img.size[0] * ratio), int(img.size[1] * ratio))
        img = img.resize(nuevo_tamano, Image.Resampling.LANCZOS)

    calidad = 90
    resultado = None
    while calidad >= MIN_QUALITY:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=calidad, optimize=True)
        resultado = buf.getvalue()
        if len(resultado) <= TARGET_BYTES:
            return resultado
        calidad -= 5

    escala = 0.9
    while escala > 0.3:
        nuevo_tamano = (int(img.size[0] * escala), int(img.size[1] * escala))
        img_reducida = img.resize(nuevo_tamano, Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img_reducida.save(buf, format="JPEG", quality=MIN_QUALITY, optimize=True)
        resultado = buf.getvalue()
        if len(resultado) <= TARGET_BYTES:
            return resultado
        escala -= 0.1

    return resultado

@app.route("/convert", methods=["POST"])
def convert():
    if request.headers.get("X-API-Key") != API_SECRET:
        return jsonify({"error": "No autorizado"}), 401

    if "file" not in request.files:
        return jsonify({"error": "No se envió ningún archivo (campo 'file')"}), 400

    uploaded = request.files["file"]
    original_name = os.path.splitext(uploaded.filename)[0]
    ext = os.path.splitext(uploaded.filename)[1].lower()

    extensiones_validas = [".ai", ".pdf", ".jpg", ".jpeg", ".png"]
    if ext not in extensiones_validas:
        return jsonify({"error": f"Extensión no soportada: {ext}"}), 400

    try:
        uploaded_bytes = uploaded.read()
        if ext in [".ai", ".pdf"]:
            # PyMuPDF abre directamente los bytes en memoria.
            # Los archivos .ai de Illustrator se abren como "pdf" de forma forzada si tienen compatibilidad PDF.
            doc = fitz.open(stream=uploaded_bytes, filetype="pdf")
            if len(doc) == 0:
                return jsonify({"error": "El archivo PDF o .ai está vacío o no es compatible"}), 400
            
            page = doc.load_page(0) # Primera página
            pix = page.get_pixmap(dpi=150)
            imagen_bytes = pix.tobytes("jpg")
            doc.close()
        else:
            imagen_bytes = uploaded_bytes

        imagen_final = comprimir_a_objetivo(imagen_bytes)

        return send_file(
            io.BytesIO(imagen_final),
            mimetype="image/jpeg",
            download_name=f"{original_name}.jpg",
        )
    except Exception as e:
        logger.error(f"Excepción en convert: {str(e)}")
        return jsonify({"error": "Error interno del servidor", "detail": str(e)}), 500


# --- PORTAL WEB Y BÚSQUEDA ---

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/api/buscar", methods=["GET"])
def buscar():
    global sheets_cache
    
    if "data" in sheets_cache:
        return jsonify({"ilustraciones": sheets_cache["data"], "cached": True})

    s_service, _, err = get_google_services()
    if err:
        return jsonify({"error": err}), 500

    if not SPREADSHEET_ID:
        return jsonify({"error": "SPREADSHEET_ID no está configurado."}), 500

    try:
        # 1. Obtener la metadata de las hojas del Google Sheet para procesarlas
        spreadsheet_metadata = s_service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        sheets = spreadsheet_metadata.get("sheets", [])
        
        hojas_excluidas = ["_Config", "Copiar", "Buscador"]
        datos_completos = []

        # 2. Iterar por cada hoja que no sea de sistema o de subcarpetas
        for sheet in sheets:
            sheet_name = sheet["properties"]["title"]
            
            # Excluir hojas de configuración, copiadores, buscadores y hojas auxiliares de carpetas
            if sheet_name in hojas_excluidas or sheet_name.endswith("-Carpetas"):
                continue

            logger.info(f"Leyendo hoja: {sheet_name}")
            
            # Leer los datos de la hoja
            result = s_service.spreadsheets().values().get(
                spreadsheetId=SPREADSHEET_ID,
                range=f"'{sheet_name}'!A:AC"
            ).execute()
            
            rows = result.get("values", [])
            if len(rows) < 2:
                continue # Hoja vacía o solo con cabeceras

            cabecera = rows[0]
            # Validar si es una hoja de listado válida (debe tener el ID de archivo en la columna 8)
            if len(cabecera) < 8 or cabecera[3] != "Nombre Archivo":
                continue

            for idx, r in enumerate(rows[1:], start=2):
                # Completar las columnas vacías con cadenas vacías para evitar IndexError
                while len(r) < 29:
                    r.append("")

                # Extraer la ID de la miniatura/imagen final JPG de la columna 16 (P)
                # O si no existe la de la columna 8 (H) como fallback
                id_imagen_jpg = ""
                url_imagen_jpg = r[15].strip()
                if url_imagen_jpg:
                    # Intentar extraer la ID del enlace de Drive (formato docs.google.com/open?id=XXX o drive.google.com/file/d/XXX/view)
                    if "id=" in url_imagen_jpg:
                        id_imagen_jpg = url_imagen_jpg.split("id=")[-1].split("&")[0]
                    elif "/file/d/" in url_imagen_jpg:
                        id_imagen_jpg = url_imagen_jpg.split("/file/d/")[1].split("/")[0]
                
                # Si no se pudo resolver el JPG, se usa la del archivo original
                id_original = r[7].strip()
                if not id_imagen_jpg:
                    id_imagen_jpg = id_original

                # Mapear los campos
                item = {
                    "sheet_origin": sheet_name,
                    "path_completo": r[0],
                    "carpeta": r[1],
                    "nombre_archivo": r[3],
                    "fecha": r[4],
                    "tamano_mb": r[5],
                    "url_original": r[6],
                    "id_original": id_original,
                    "descripcion_manual": r[8],
                    "tipo_archivo": r[9],
                    "creador": r[10],
                    "email_creador": r[11],
                    "estado_conversion": r[14],
                    "id_imagen_jpg": id_imagen_jpg,
                    # Datos de IA
                    "titulo_ilustracion": r[16] or r[3],
                    "descripcion_ia": r[17],
                    "descripcion_personajes": r[18],
                    "objetos_escena": r[19],
                    "proyecto": r[20],
                    "sector": r[21],
                    "nombres_posibles": r[22],
                    "perspectiva": r[23],
                    "paleta_color": r[24],
                    "textos_en_imagen": r[25],
                    "extension": r[26],
                    "filtro_anti_shutterstock": r[27]
                }
                datos_completos.append(item)

        sheets_cache["data"] = datos_completos
        logger.info(f"Caché de Sheets actualizada. Registros totales: {len(datos_completos)}")
        return jsonify({"ilustraciones": datos_completos, "cached": False})

    except Exception as e:
        logger.error(f"Error al leer Google Sheets: {str(e)}")
        return jsonify({"error": f"Fallo al leer base de datos de Sheets: {str(e)}"}), 500


@app.route("/api/sincronizar", methods=["POST"])
def sincronizar():
    sheets_cache.clear()
    logger.info("Caché invalidada manualmente por petición POST.")
    return jsonify({"status": "Caché invalidada, los datos se recargarán en la próxima consulta."})


@app.route("/api/miniatura/<image_id>", methods=["GET"])
def miniatura(image_id):
    if not image_id or image_id == "N/A" or len(image_id) < 5:
        return jsonify({"error": "ID de imagen inválido"}), 400

    _, d_service, err = get_google_services()
    if err:
        return jsonify({"error": err}), 500

    try:
        from googleapiclient.http import MediaIoBaseDownload

        # Descargar los bytes de la imagen desde Google Drive
        request_media = d_service.files().get_media(fileId=image_id, supportsAllDrives=True)
        file_buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(file_buffer, request_media)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
            
        file_buffer.seek(0)
        
        # Enviar el archivo con headers HTTP de caché por 24 horas
        response = send_file(file_buffer, mimetype="image/jpeg")
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response
    except Exception as e:
        logger.error(f"Error descargando miniatura de Drive (ID: {image_id}): {str(e)}")
        return jsonify({"error": "No se pudo descargar la imagen de Google Drive"}), 404


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "google_sheets_connected": sheets_service is not None,
        "google_drive_connected": drive_service is not None,
        "spreadsheet_configured": SPREADSHEET_ID != ""
    })


if __name__ == "__main__":
    # Hugging Face Spaces requiere escuchar en el puerto 7860
    app.run(host="0.0.0.0", port=7860)
