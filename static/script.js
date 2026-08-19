// Variables de estado global
let todasIlustraciones = [];
let ilustracionesFiltradas = [];
let paginaActual = 1;
const itemsPorPagina = 40;
let debounceTimer;
let vistaActual = 'grid'; // 'grid' | 'list'
let ordenActual = 'relevancia';
let colorSeleccionado = null; // hex normalizado (#rrggbb) o null

// Distancia máxima (fórmula "redmean") para considerar que un color de la paleta
// de un ítem coincide con el color buscado. Valor inicial estimado a ojo: ajustar
// una vez probado contra los datos reales del Sheet.
const UMBRAL_DISTANCIA_COLOR = 100;

// Lista fija de sectores disponibles para el filtro (no se derivan de los datos)
const SECTORES_DISPONIBLES = [
    'Educación inicial',
    'Educación',
    'Desarrollo humano',
    'Empleo y capacitación',
    'Maquinaria y aparatos',
    'Ciencia y tecnología',
    'Salud',
    'Seguridad y prevención',
    'Industria',
    'Construcción',
    'Minería',
    'Agricultura y apicultura',
    'Medio ambiente',
    'Historia',
    'Cultura',
    'Geografía',
    'Comunicación',
    'Habilidades sociales',
    'Familia y comunidad',
    'Inclusión y discapacidad',
    'Deportes',
    'Arte',
    'Entretenimiento',
    'Redes sociales',
    'Otro'
];

// Lista fija de extensiones disponibles para el filtro (no se derivan de los datos)
const EXTENSIONES_CONOCIDAS = ['.ai', '.pdf', '.jpg', '.png'];
const EXTENSIONES_DISPONIBLES = [...EXTENSIONES_CONOCIDAS, 'otro'];

// Elementos del DOM
const loader = document.getElementById('loader');
const galleryGrid = document.getElementById('gallery-grid');
const emptyState = document.getElementById('empty-state');
const statsTotal = document.getElementById('stats-total');
const statsMatch = document.getElementById('stats-match');

// Toolbar (contador, orden, vista)
const toolbarCount = document.getElementById('toolbar-count');
const sortSelect = document.getElementById('sort-select');
const viewGridBtn = document.getElementById('view-grid-btn');
const viewListBtn = document.getElementById('view-list-btn');
const paginationNav = document.getElementById('pagination');

// Filtros
const searchInput = document.getElementById('search-input');
const projectFilter = document.getElementById('project-filter');
const sectorFilter = document.getElementById('sector-filter');
const extensionFilter = document.getElementById('extension-filter');
const yearFilter = document.getElementById('year-filter');
const colorFilterTrigger = document.getElementById('color-filter-trigger');
const colorFilterSwatch = document.getElementById('color-filter-swatch');
const colorFilterLabel = document.getElementById('color-filter-label');
const colorFilterClear = document.getElementById('color-filter-clear');
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
const openFolderBtn = document.getElementById('open-folder-btn');

// --- ANIMACIONES DE SCROLL ---

const navbarEl = document.querySelector('.navbar');

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

let ultimoScrollY = window.scrollY;
let scrollTicking = false;

function actualizarNavbarEnScroll() {
    const actualY = window.scrollY;
    if (actualY > ultimoScrollY && actualY > 120) {
        navbarEl.classList.add('nav-hidden');
    } else {
        navbarEl.classList.remove('nav-hidden');
    }
    ultimoScrollY = actualY;
    scrollTicking = false;
}

window.addEventListener('scroll', () => {
    if (!scrollTicking) {
        requestAnimationFrame(actualizarNavbarEnScroll);
        scrollTicking = true;
    }
}, { passive: true });

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
        ilustracionesFiltradas = ordenarIlustraciones([...todasIlustraciones]);

        statsTotal.textContent = todasIlustraciones.length;
        actualizarContadorResultados(ilustracionesFiltradas.length);

        inicializarFiltros();
        renderizarGaleria();
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
    resetSelect(yearFilter, "Todos los años");

    const proyectos = new Set();
    const anios = new Set();

    todasIlustraciones.forEach(item => {
        if (item.proyecto) proyectos.add(item.proyecto.trim());

        const fechaParseada = parsearFechaCreacion(item.fecha);
        if (fechaParseada) anios.add(fechaParseada.getFullYear());
    });

    // Rellenar selects
    cargarOpcionesSelect(projectFilter, Array.from(proyectos).sort());
    cargarOpcionesSelect(sectorFilter, SECTORES_DISPONIBLES);
    cargarOpcionesSelect(extensionFilter, EXTENSIONES_DISPONIBLES);
    cargarOpcionesSelect(yearFilter, Array.from(anios).sort((a, b) => b - a));
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

// El campo "sector" de un \u00edtem puede traer varios sectores separados por coma
// (ej. "comunicacion, educacion, desarrollo_humano"). Coincide si alguno de ellos
// corresponde al sector seleccionado en el filtro, sin importar acentos/guiones bajos.
function sectorCoincide(sectorItem, sectorSeleccionado) {
    if (!sectorItem) return false;
    const normalizar = (s) => normalizarTexto(s.replace(/_/g, ' ')).trim();
    const objetivo = normalizar(sectorSeleccionado);
    return sectorItem.split(',').some(parte => normalizar(parte) === objetivo);
}

function actualizarContadorResultados(n) {
    statsMatch.textContent = n;
    toolbarCount.textContent = n;
}

// El Sheet entrega la fecha de creación en formato DD/MM/AAAA (ej. "15/03/2024").
// new Date(string) es ambiguo con ese formato, así que se parsea manualmente.
// Devuelve null si el texto no es una fecha reconocible.
function parsearFechaCreacion(fechaStr) {
    if (!fechaStr) return null;
    const partes = fechaStr.trim().split('/');
    if (partes.length !== 3) return null;

    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    const anio = parseInt(partes[2], 10);
    if (!dia || !mes || !anio) return null;

    const fecha = new Date(anio, mes - 1, dia);
    return isNaN(fecha.getTime()) ? null : fecha;
}

// --- BÚSQUEDA POR COLOR ---

// El campo "paleta_color" trae colores hex separados por coma o punto y coma
// (ej. "#3A5F2B, #8B4513, #D4A857"). Se descarta cualquier token que no sea un
// hex válido, ya que el formato de la columna todavía no está 100% estandarizado.
function parsearPaletaColor(paletaStr) {
    if (!paletaStr) return [];
    return paletaStr
        .split(/[,;]/)
        .map(token => token.trim())
        .filter(token => /^#?[0-9a-f]{6}$/i.test(token))
        .map(token => '#' + token.replace('#', '').toLowerCase());
}

function hexARgb(hex) {
    const valor = hex.replace('#', '');
    return {
        r: parseInt(valor.substring(0, 2), 16),
        g: parseInt(valor.substring(2, 4), 16),
        b: parseInt(valor.substring(4, 6), 16),
    };
}

// Distancia perceptual "redmean" entre dos colores hex (fórmula usada por ImageMagick).
// Cuanto menor el valor, más parecidos son los colores.
function distanciaColor(hexA, hexB) {
    const a = hexARgb(hexA);
    const b = hexARgb(hexB);
    const rMedio = (a.r + b.r) / 2;
    const dR = a.r - b.r;
    const dG = a.g - b.g;
    const dB = a.b - b.b;
    return Math.sqrt((2 + rMedio / 256) * dR * dR + 4 * dG * dG + (2 + (255 - rMedio) / 256) * dB * dB);
}

// Menor distancia entre el color buscado y cualquiera de los colores de la paleta del ítem.
function distanciaMinimaColor(item, hexSeleccionado) {
    const colores = parsearPaletaColor(item.paleta_color);
    if (colores.length === 0) return Infinity;
    return Math.min(...colores.map(c => distanciaColor(c, hexSeleccionado)));
}

// --- ORDENAMIENTO ---

function ordenarIlustraciones(lista) {
    if (ordenActual === 'relevancia') {
        // Sin un orden explícito, si hay un color buscado se muestran primero
        // las coincidencias más parecidas.
        if (colorSeleccionado) {
            return [...lista].sort((a, b) => distanciaMinimaColor(a, colorSeleccionado) - distanciaMinimaColor(b, colorSeleccionado));
        }
        return lista;
    }

    const copia = [...lista];

    switch (ordenActual) {
        case 'fecha-desc':
            return copia.sort((a, b) => (parsearFechaCreacion(b.fecha)?.getTime() || 0) - (parsearFechaCreacion(a.fecha)?.getTime() || 0));
        case 'fecha-asc':
            return copia.sort((a, b) => (parsearFechaCreacion(a.fecha)?.getTime() || 0) - (parsearFechaCreacion(b.fecha)?.getTime() || 0));
        case 'titulo-asc':
            return copia.sort((a, b) => (a.titulo_ilustracion || '').localeCompare(b.titulo_ilustracion || '', 'es', { sensitivity: 'base' }));
        case 'titulo-desc':
            return copia.sort((a, b) => (b.titulo_ilustracion || '').localeCompare(a.titulo_ilustracion || '', 'es', { sensitivity: 'base' }));
        case 'proyecto-asc':
            return copia.sort((a, b) => (a.proyecto || '').localeCompare(b.proyecto || '', 'es', { sensitivity: 'base' }));
        default:
            return lista;
    }
}

function aplicarFiltros() {
    const query = normalizarTexto(searchInput.value);
    const proyecto = projectFilter.value;
    const sector = sectorFilter.value;
    const formato = extensionFilter.value;
    const anio = yearFilter.value;

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
        
        // 3. Filtro de Sector (coincidencia parcial, el campo puede traer varios sectores)
        if (sector && !sectorCoincide(item.sector, sector)) return false;
        
        // 4. Filtro de Formato/Extensión (incluye la opción "otro" para formatos fuera de la lista)
        if (formato) {
            let ext = item.extension ? item.extension.trim().toLowerCase() : '';
            if (!ext && item.nombre_archivo) {
                const partes = item.nombre_archivo.split('.');
                if (partes.length > 1) ext = '.' + partes.pop().toLowerCase();
            }
            if (formato === 'otro') {
                if (EXTENSIONES_CONOCIDAS.includes(ext)) return false;
            } else if (ext !== formato) {
                return false;
            }
        }

        // 5. Filtro de Año de Creación
        if (anio) {
            const fechaParseada = parsearFechaCreacion(item.fecha);
            if (!fechaParseada || String(fechaParseada.getFullYear()) !== anio) return false;
        }

        // 6. Filtro de Color (coincide si algún color de la paleta del ítem está
        // suficientemente cerca del color seleccionado)
        if (colorSeleccionado && distanciaMinimaColor(item, colorSeleccionado) > UMBRAL_DISTANCIA_COLOR) return false;

        return true;
    });

    ilustracionesFiltradas = ordenarIlustraciones(ilustracionesFiltradas);

    actualizarContadorResultados(ilustracionesFiltradas.length);
    paginaActual = 1;
    renderizarGaleria();
}

// --- RENDERIZADO DE LA GALERÍA ---

function renderizarGaleria() {
    galleryGrid.innerHTML = '';

    if (ilustracionesFiltradas.length === 0) {
        galleryGrid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        paginationNav.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    galleryGrid.classList.remove('hidden');
    
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = Math.min(inicio + itemsPorPagina, ilustracionesFiltradas.length);
    
    const fragmento = document.createDocumentFragment();
    
    for (let i = inicio; i < fin; i++) {
        const item = ilustracionesFiltradas[i];
        const card = crearCardIlustracion(item, i, i - inicio);
        fragmento.appendChild(card);
    }
    
    galleryGrid.appendChild(fragmento);

    renderizarPaginacion();
}

// --- PAGINACIÓN ---

function obtenerRangoPaginas(actual, total) {
    const rango = [];
    const ventana = 1; // páginas visibles a cada lado de la actual

    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= actual - ventana && i <= actual + ventana)) {
            rango.push(i);
        } else if (rango[rango.length - 1] !== '...') {
            rango.push('...');
        }
    }

    return rango;
}

function renderizarPaginacion() {
    const totalPaginas = Math.ceil(ilustracionesFiltradas.length / itemsPorPagina);
    paginationNav.innerHTML = '';

    if (totalPaginas <= 1) {
        paginationNav.classList.add('hidden');
        return;
    }

    paginationNav.classList.remove('hidden');

    const irAPagina = (n) => {
        paginaActual = n;
        renderizarGaleria();
        galleryGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const crearBoton = (texto, disabled, onClick, activo = false) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'page-btn' + (activo ? ' active' : '');
        btn.textContent = texto;
        btn.disabled = disabled;
        if (!activo && !disabled) btn.addEventListener('click', onClick);
        return btn;
    };

    paginationNav.appendChild(crearBoton('‹', paginaActual === 1, () => irAPagina(paginaActual - 1)));

    obtenerRangoPaginas(paginaActual, totalPaginas).forEach(item => {
        if (item === '...') {
            const span = document.createElement('span');
            span.className = 'page-ellipsis';
            span.textContent = '…';
            paginationNav.appendChild(span);
        } else {
            paginationNav.appendChild(crearBoton(item, false, () => irAPagina(item), item === paginaActual));
        }
    });

    paginationNav.appendChild(crearBoton('›', paginaActual === totalPaginas, () => irAPagina(paginaActual + 1)));
}

function crearCardIlustracion(item, index, posicionEnPagina) {
    const card = document.createElement('article');
    card.className = 'card reveal';
    card.dataset.index = index;
    card.style.transitionDelay = ((posicionEnPagina % 12) * 40) + 'ms';
    
    // Definir la url de la miniatura a través del proxy del backend
    let miniaturaUrl = '/static/images/placeholder.png'; // Fallback por defecto
    if (item.id_imagen_jpg && item.id_imagen_jpg !== 'N/A') {
        miniaturaUrl = `/api/miniatura/${item.id_imagen_jpg}`;
    }
    
    // Formato o tipo de archivo
    let fileFormat = item.extension ? item.extension.trim().toUpperCase() : 'IMG';
    if (fileFormat.startsWith('.')) fileFormat = fileFormat.slice(1);

    const tieneUrlOriginal = item.url_original && item.url_original !== '#';
    const tieneLinkCarpeta = item.link_carpeta && item.link_carpeta !== '#';

    card.innerHTML = `
        <div class="card-image-wrapper">
            <span class="card-badge">${fileFormat}</span>
            <a href="${tieneUrlOriginal ? item.url_original : '#'}" target="_blank" rel="noopener" class="card-download-btn${tieneUrlOriginal ? '' : ' hidden'}" title="Descargar archivo original de Drive" aria-label="Descargar archivo original de Drive">⬇</a>
            <a href="${tieneLinkCarpeta ? item.link_carpeta : '#'}" target="_blank" rel="noopener" class="card-folder-btn${tieneLinkCarpeta ? '' : ' hidden'}" title="Abrir carpeta en Drive" aria-label="Abrir carpeta en Drive">📁</a>
            <img src="${miniaturaUrl}" alt="${item.titulo_ilustracion}" loading="lazy" class="skeleton">
        </div>
        <div class="card-content">
            <span class="badge-tag">${item.proyecto || 'Sin Proyecto'}</span>
            <h3>${item.titulo_ilustracion}</h3>
            <p>${item.descripcion_ia || item.descripcion_manual || 'Sin descripción disponible.'}</p>
            <div class="card-meta-extra">
                <span>${fileFormat}</span>
                <span>${item.fecha || 'Sin fecha'}</span>
                <span>${item.creador || 'Sin creador'}</span>
            </div>
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
        imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23161616"/><text x="50" y="55" font-family="sans-serif" font-size="12" fill="%23656F6A" text-anchor="middle">Sin Vista Previa</text></svg>';
    });

    const downloadBtn = card.querySelector('.card-download-btn');
    downloadBtn.addEventListener('click', (e) => e.stopPropagation());

    const folderBtn = card.querySelector('.card-folder-btn');
    folderBtn.addEventListener('click', (e) => e.stopPropagation());

    card.addEventListener('click', () => abrirDetalle(item));
    revealObserver.observe(card);

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

    // Botón para ir a la carpeta contenedora en Drive
    if (item.link_carpeta && item.link_carpeta !== '#') {
        openFolderBtn.href = item.link_carpeta;
        openFolderBtn.classList.remove('hidden');
    } else {
        openFolderBtn.classList.add('hidden');
    }

    // Configurar carga de imagen en el visualizador del modal
    modalImg.classList.add('hidden');
    modalImgLoader.style.display = 'block';
    
    if (item.id_imagen_jpg && item.id_imagen_jpg !== 'N/A') {
        modalImg.src = `/api/miniatura/${item.id_imagen_jpg}`;
    } else {
        modalImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23161616"/><text x="50" y="55" font-family="sans-serif" font-size="8" fill="%23656F6A" text-anchor="middle">Vista previa no disponible</text></svg>';
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

// --- VISTA GRID / LISTA ---

function aplicarVista(modo) {
    vistaActual = modo;
    localStorage.setItem('vistaGaleria', modo);

    const esLista = modo === 'list';
    galleryGrid.classList.toggle('view-list', esLista);

    viewGridBtn.classList.toggle('active', !esLista);
    viewGridBtn.setAttribute('aria-pressed', String(!esLista));
    viewListBtn.classList.toggle('active', esLista);
    viewListBtn.setAttribute('aria-pressed', String(esLista));
}

// --- SELECTOR DE COLOR (Pickr) ---

let pickrColor = null;

function actualizarTriggerColor() {
    if (colorSeleccionado) {
        colorFilterSwatch.style.background = colorSeleccionado;
        colorFilterLabel.textContent = colorSeleccionado;
        colorFilterClear.hidden = false;
    } else {
        colorFilterSwatch.style.background = '';
        colorFilterLabel.textContent = 'Todos los colores';
        colorFilterClear.hidden = true;
    }
}

function inicializarColorPicker() {
    pickrColor = Pickr.create({
        el: '#color-picker-anchor',
        theme: 'classic',
        default: '#18ae91',
        swatches: [
            '#F87171', '#FB923C', '#FBBF24', '#FACC15', '#A3E635',
            '#34D399', '#18AE91', '#22D3EE', '#60A5FA', '#818CF8',
            '#A78BFA', '#E879F9', '#F472B6', '#FFFFFF', '#111111'
        ],
        components: {
            preview: true,
            opacity: false,
            hue: true,
            interaction: {
                hex: true,
                input: true,
                save: true,
                clear: true,
            },
        },
    });

    pickrColor.on('save', (color) => {
        colorSeleccionado = color.toHEXA().toString().toLowerCase();
        actualizarTriggerColor();
        aplicarFiltros();
        pickrColor.hide();
    });

    pickrColor.on('clear', () => {
        colorSeleccionado = null;
        actualizarTriggerColor();
        aplicarFiltros();
    });

    colorFilterTrigger.addEventListener('click', () => pickrColor.show());
    colorFilterClear.addEventListener('click', (e) => {
        e.stopPropagation();
        colorSeleccionado = null;
        actualizarTriggerColor();
        aplicarFiltros();
    });
}

// --- EVENTOS Y ESCUCHAS ---

searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(aplicarFiltros, 250); // Debounce de 250ms
});

projectFilter.addEventListener('change', aplicarFiltros);
sectorFilter.addEventListener('change', aplicarFiltros);
extensionFilter.addEventListener('change', aplicarFiltros);
yearFilter.addEventListener('change', aplicarFiltros);

sortSelect.addEventListener('change', () => {
    ordenActual = sortSelect.value;
    aplicarFiltros();
});

viewGridBtn.addEventListener('click', () => aplicarVista('grid'));
viewListBtn.addEventListener('click', () => aplicarVista('list'));

closeModalBtn.addEventListener('click', cerrarModal);
detailModal.querySelector('.modal-backdrop').addEventListener('click', cerrarModal);

// Cerrar modal con la tecla Esc
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) {
        cerrarModal();
    }
});

// Botón de sincronización manual (solo visible para administradores)
if (syncBtn) {
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
}

// Restaurar preferencia de vista (grid/lista) guardada
aplicarVista(localStorage.getItem('vistaGaleria') || 'grid');

// Inicializar el selector de color (no depende de la carga de datos)
inicializarColorPicker();

// Observar los elementos estáticos con animación de aparición (sidebar)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
});

// Inicializar la carga al entrar a la página
document.addEventListener('DOMContentLoaded', cargarCatálogo);
