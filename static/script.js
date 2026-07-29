// Variables de estado global
let todasIlustraciones = [];
let ilustracionesFiltradas = [];
let paginaActual = 1;
const itemsPorPagina = 40;
let debounceTimer;

// Elementos del DOM
const loader = document.getElementById('loader');
const galleryGrid = document.getElementById('gallery-grid');
const emptyState = document.getElementById('empty-state');
const statsTotal = document.getElementById('stats-total');
const statsMatch = document.getElementById('stats-match');

// Filtros
const searchInput = document.getElementById('search-input');
const projectFilter = document.getElementById('project-filter');
const sectorFilter = document.getElementById('sector-filter');
const extensionFilter = document.getElementById('extension-filter');
const creatorFilter = document.getElementById('creator-filter');
const syncBtn = document.getElementById('sync-btn');

// Modal
const detailModal = document.getElementById('detail-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalImg = document.getElementById('modal-img');
const modalImgLoader = document.getElementById('modal-img-loader');
const modalTitle = document.getElementById('modal-title');
const modalBadgeProject = document.getElementById('modal-badge-project');
const modalDescIa = document.getElementById('modal-desc-ia');
const modalDescDetallada = document.getElementById('modal-desc-detallada');
const modalPersonajes = document.getElementById('modal-personajes');
const modalObjetos = document.getElementById('modal-objetos');
const modalPerspectiva = document.getElementById('modal-perspectiva');
const modalColores = document.getElementById('modal-colores');
const modalNombresPosibles = document.getElementById('modal-nombres-posibles');
const modalTextos = document.getElementById('modal-textos');
const modalSector = document.getElementById('modal-sector');
const modalExtension = document.getElementById('modal-extension');
const modalCreador = document.getElementById('modal-creador');
const modalFecha = document.getElementById('modal-fecha');
const modalShutterstock = document.getElementById('modal-shutterstock');
const modalOrigen = document.getElementById('modal-origen');
const downloadOrigBtn = document.getElementById('download-orig-btn');

// --- CARGA DE DATOS ---

async function cargarCatálogo() {
    mostrarLoader(true);
    galleryGrid.classList.add('hidden');
    emptyState.classList.add('hidden');
    
    try {
        const response = await fetch('/api/buscar');
        const data = await response.json();
        
        if (data.error) {
            alert(`Error de configuración: ${data.error}`);
            mostrarLoader(false);
            return;
        }
        
        todasIlustraciones = data.ilustraciones || [];
        ilustracionesFiltradas = [...todasIlustraciones];
        
        statsTotal.textContent = todasIlustraciones.length;
        statsMatch.textContent = ilustracionesFiltradas.length;
        
        inicializarFiltros();
        renderizarGaleria(true);
    } catch (e) {
        console.error("Error cargando el catálogo:", e);
        alert("Ocurrió un error al intentar cargar los datos desde Google Sheets. Verifica las credenciales.");
    } finally {
        mostrarLoader(false);
    }
}

function mostrarLoader(visible) {
    if (visible) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// --- FILTRADO EN CLIENTE ---

function inicializarFiltros() {
    // Limpiar opciones previas en los selects (manteniendo la opción "Todos")
    resetSelect(projectFilter, "Todos los proyectos");
    resetSelect(sectorFilter, "Todos los sectores");
    resetSelect(extensionFilter, "Todos los formatos");
    resetSelect(creatorFilter, "Todos los creadores");
    
    const proyectos = new Set();
    const sectores = new Set();
    const extensiones = new Set();
    const creadores = new Set();
    
    todasIlustraciones.forEach(item => {
        if (item.proyecto) proyectos.add(item.proyecto.trim());
        if (item.sector) sectores.add(item.sector.trim());
        
        // Determinar extensión legible
        let ext = item.extension ? item.extension.trim().toLowerCase() : '';
        if (!ext && item.nombre_archivo) {
            const partes = item.nombre_archivo.split('.');
            if (partes.length > 1) ext = '.' + partes.pop().toLowerCase();
        }
        if (ext) extensiones.add(ext);
        
        if (item.creador) creadores.add(item.creador.trim());
    });
    
    // Rellenar selects
    cargarOpcionesSelect(projectFilter, Array.from(proyectos).sort());
    cargarOpcionesSelect(sectorFilter, Array.from(sectores).sort());
    cargarOpcionesSelect(extensionFilter, Array.from(extensiones).sort());
    cargarOpcionesSelect(creatorFilter, Array.from(creadores).sort());
}

function resetSelect(selectEl, defaultText) {
    selectEl.innerHTML = `<option value="">${defaultText}</option>`;
}

function cargarOpcionesSelect(selectEl, listaValores) {
    listaValores.forEach(valor => {
        if (valor && valor !== "N/A") {
            const opt = document.createElement('option');
            opt.value = valor;
            opt.textContent = valor;
            selectEl.appendChild(opt);
        }
    });
}

// Función auxiliar para quitar acentos de búsquedas
function normalizarTexto(texto) {
    return (texto || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function aplicarFiltros() {
    const query = normalizarTexto(searchInput.value);
    const proyecto = projectFilter.value;
    const sector = sectorFilter.value;
    const formato = extensionFilter.value;
    const creador = creatorFilter.value;
    
    ilustracionesFiltradas = todasIlustraciones.filter(item => {
        // 1. Filtro de Texto (Buscador universal)
        if (query) {
            const coincidencia = 
                normalizarTexto(item.nombre_archivo).includes(query) ||
                normalizarTexto(item.titulo_ilustracion).includes(query) ||
                normalizarTexto(item.descripcion_manual).includes(query) ||
                normalizarTexto(item.descripcion_ia).includes(query) ||
                normalizarTexto(item.descripcion_personajes).includes(query) ||
                normalizarTexto(item.objetos_escena).includes(query) ||
                normalizarTexto(item.nombres_posibles).includes(query) ||
                normalizarTexto(item.textos_en_imagen).includes(query);
                
            if (!coincidencia) return false;
        }
        
        // 2. Filtro de Proyecto
        if (proyecto && item.proyecto !== proyecto) return false;
        
        // 3. Filtro de Sector
        if (sector && item.sector !== sector) return false;
        
        // 4. Filtro de Formato/Extensión
        if (formato) {
            let ext = item.extension ? item.extension.trim().toLowerCase() : '';
            if (!ext && item.nombre_archivo) {
                const partes = item.nombre_archivo.split('.');
                if (partes.length > 1) ext = '.' + partes.pop().toLowerCase();
            }
            if (ext !== formato.toLowerCase()) return false;
        }
        
        // 5. Filtro de Creador
        if (creador && item.creador !== creador) return false;
        
        return true;
    });
    
    statsMatch.textContent = ilustracionesFiltradas.length;
    paginaActual = 1;
    renderizarGaleria(true);
}

// --- RENDERIZADO DE LA GALERÍA ---

function renderizarGaleria(limpiar = false) {
    if (limpiar) {
        galleryGrid.innerHTML = '';
    }
    
    if (ilustracionesFiltradas.length === 0) {
        galleryGrid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    galleryGrid.classList.remove('hidden');
    
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = Math.min(inicio + itemsPorPagina, ilustracionesFiltradas.length);
    
    const fragmento = document.createDocumentFragment();
    
    for (let i = inicio; i < fin; i++) {
        const item = ilustracionesFiltradas[i];
        const card = crearCardIlustracion(item, i);
        fragmento.appendChild(card);
    }
    
    galleryGrid.appendChild(fragmento);
    
    // Crear botón "Cargar más" si hay más páginas de registros
    removerBotonCargarMas();
    if (fin < ilustracionesFiltradas.length) {
        const btnCargar = document.createElement('button');
        btnCargar.id = 'load-more-btn';
        btnCargar.className = 'btn btn-secondary';
        btnCargar.style.gridColumn = '1 / -1';
        btnCargar.style.margin = '2rem auto';
        btnCargar.textContent = 'Cargar más ilustraciones';
        btnCargar.addEventListener('click', () => {
            paginaActual++;
            renderizarGaleria(false);
        });
        galleryGrid.appendChild(btnCargar);
    }
}

function removerBotonCargarMas() {
    const btnPrevio = document.getElementById('load-more-btn');
    if (btnPrevio) btnPrevio.remove();
}

function crearCardIlustracion(item, index) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.index = index;
    
    // Definir la url de la miniatura a través del proxy del backend
    let miniaturaUrl = '/static/images/placeholder.png'; // Fallback por defecto
    if (item.id_imagen_jpg && item.id_imagen_jpg !== 'N/A') {
        miniaturaUrl = `/api/miniatura/${item.id_imagen_jpg}`;
    }
    
    // Formato o tipo de archivo
    let fileFormat = item.extension ? item.extension.trim().toUpperCase() : 'IMG';
    if (fileFormat.startsWith('.')) fileFormat = fileFormat.slice(1);
    
    card.innerHTML = `
        <div class="card-image-wrapper">
            <span class="card-badge">${fileFormat}</span>
            <img src="${miniaturaUrl}" alt="${item.titulo_ilustracion}" loading="lazy" class="skeleton">
        </div>
        <div class="card-content">
            <span class="badge-tag">${item.proyecto || 'Sin Proyecto'}</span>
            <h3>${item.titulo_ilustracion}</h3>
            <p>${item.descripcion_ia || item.descripcion_manual || 'Sin descripción disponible.'}</p>
            <div class="card-footer">
                <span>Sector: ${item.sector || 'N/D'}</span>
            </div>
        </div>
    `;
    
    // Quitar animación de esqueleto (skeleton) al terminar de cargar la imagen
    const imgEl = card.querySelector('img');
    imgEl.addEventListener('load', () => imgEl.classList.remove('skeleton'));
    imgEl.addEventListener('error', () => {
        imgEl.classList.remove('skeleton');
        imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231E273E"/><text x="50" y="55" font-family="sans-serif" font-size="12" fill="%236B7280" text-anchor="middle">Sin Vista Previa</text></svg>';
    });

    card.addEventListener('click', () => abrirDetalle(item));
    
    return card;
}

// --- MODAL DE VISTA DETALLADA ---

function abrirDetalle(item) {
    modalTitle.textContent = item.titulo_ilustracion || item.nombre_archivo;
    modalBadgeProject.textContent = item.proyecto || 'Sin Proyecto';
    modalDescIa.textContent = item.descripcion_ia || 'Sin descripción de IA disponible.';
    modalDescDetallada.textContent = item.descripcion_manual || item.descripcion_ia || 'Sin descripción ampliada.';
    modalPersonajes.textContent = item.descripcion_personajes || 'Ninguno';
    modalObjetos.textContent = item.objetos_escena || 'Ninguno';
    modalPerspectiva.textContent = item.perspectiva || '-';
    modalColores.textContent = item.paleta_color || '-';
    modalNombresPosibles.textContent = item.nombres_posibles || '-';
    modalTextos.textContent = item.textos_en_imagen || 'No se detectó texto en la imagen.';
    modalSector.textContent = item.sector || '-';
    modalExtension.textContent = item.extension || item.tipo_archivo || '-';
    modalCreador.textContent = `${item.creador || 'Desconocido'} (${item.email_creador || 'N/D'})`;
    modalFecha.textContent = item.fecha || '-';
    modalOrigen.textContent = item.sheet_origin || '-';
    
    // Configurar estado del filtro Shutterstock (anti-stock)
    modalShutterstock.className = 'status-indicator';
    const cleanShutter = normalizarTexto(item.filtro_anti_shutterstock);
    if (cleanShutter.includes('limpio')) {
        modalShutterstock.classList.add('limpio');
        modalShutterstock.textContent = 'Limpio';
    } else if (cleanShutter.includes('revisar')) {
        modalShutterstock.classList.add('revisar');
        modalShutterstock.textContent = 'Revisar';
    } else if (cleanShutter.includes('rechazado')) {
        modalShutterstock.classList.add('rechazado');
        modalShutterstock.textContent = 'Rechazado';
    } else {
        modalShutterstock.textContent = item.filtro_anti_shutterstock || 'Pendiente';
    }

    // Botón para ir al archivo original en Drive
    if (item.url_original && item.url_original !== '#') {
        downloadOrigBtn.href = item.url_original;
        downloadOrigBtn.classList.remove('hidden');
    } else {
        downloadOrigBtn.classList.add('hidden');
    }

    // Configurar carga de imagen en el visualizador del modal
    modalImg.classList.add('hidden');
    modalImgLoader.style.display = 'block';
    
    if (item.id_imagen_jpg && item.id_imagen_jpg !== 'N/A') {
        modalImg.src = `/api/miniatura/${item.id_imagen_jpg}`;
    } else {
        modalImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231E273E"/><text x="50" y="55" font-family="sans-serif" font-size="8" fill="%236B7280" text-anchor="middle">Vista previa no disponible</text></svg>';
    }
    
    modalImg.onload = () => {
        modalImgLoader.style.display = 'none';
        modalImg.classList.remove('hidden');
    };

    modalImg.onerror = () => {
        modalImgLoader.style.display = 'none';
        modalImg.classList.remove('hidden');
    };

    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Bloquear scroll del fondo
}

function cerrarModal() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = ''; // Restaurar scroll
}

// --- EVENTOS Y ESCUCHAS ---

searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(aplicarFiltros, 250); // Debounce de 250ms
});

projectFilter.addEventListener('change', aplicarFiltros);
sectorFilter.addEventListener('change', aplicarFiltros);
extensionFilter.addEventListener('change', aplicarFiltros);
creatorFilter.addEventListener('change', aplicarFiltros);

closeModalBtn.addEventListener('click', cerrarModal);
detailModal.querySelector('.modal-backdrop').addEventListener('click', cerrarModal);

// Cerrar modal con la tecla Esc
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) {
        cerrarModal();
    }
});

// Botón de sincronización manual
syncBtn.addEventListener('click', async () => {
    if (!confirm("¿Deseas invalidar la caché de Sheets? La web se recargará con los datos nuevos en unos segundos.")) return;
    
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="icon spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></span> Sincronizando...';
    
    try {
        const response = await fetch('/api/sincronizar', { method: 'POST' });
        const res = await response.json();
        console.log(res.status);
        
        // Volver a cargar el catálogo completo
        await cargarCatálogo();
        alert("¡Datos actualizados con éxito!");
    } catch(e) {
        console.error(e);
        alert("Ocurrió un error al intentar sincronizar.");
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<span class="icon">🔄</span> Sincronizar Sheets';
    }
});

// Inicializar la carga al entrar a la página
document.addEventListener('DOMContentLoaded', cargarCatálogo);
