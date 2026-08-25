(function () {
    const overlay = document.getElementById('intro-overlay');
    const canvas = document.getElementById('intro-canvas');
    if (!overlay || !canvas) return;

    function ocultarIntro() {
        overlay.classList.add('intro-hidden');
        setTimeout(() => overlay.remove(), 650);
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        ocultarIntro();
        return;
    }

    const ctx = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    const colorBrillante = styles.getPropertyValue('--accent-secondary').trim() || '#BFFF9C';
    const colorTrail = `rgba(${styles.getPropertyValue('--accent-primary-rgb').trim() || '24, 174, 145'}, 0.85)`;

    const TAMANO_FUENTE = 16;
    const CARACTERES = 'アイウエオカキクケコサシスセソタチツテトナニヌネノABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    let ancho, alto, columnas, gotas;

    function ajustarTamano() {
        ancho = canvas.width = window.innerWidth;
        alto = canvas.height = window.innerHeight;
        columnas = Math.floor(ancho / TAMANO_FUENTE);
        gotas = new Array(columnas).fill(0).map(() => Math.random() * -50);
    }
    ajustarTamano();
    window.addEventListener('resize', ajustarTamano);

    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, ancho, alto);

    let animId;
    function dibujarFrame() {
        // Fondo semitransparente para dejar una estela detrás de cada carácter
        ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
        ctx.fillRect(0, 0, ancho, alto);

        ctx.font = `${TAMANO_FUENTE}px monospace`;
        for (let i = 0; i < columnas; i++) {
            const caracter = CARACTERES[Math.floor(Math.random() * CARACTERES.length)];
            const x = i * TAMANO_FUENTE;
            const y = gotas[i] * TAMANO_FUENTE;

            ctx.fillStyle = colorTrail;
            ctx.fillText(caracter, x, y - TAMANO_FUENTE);
            ctx.fillStyle = colorBrillante;
            ctx.fillText(caracter, x, y);

            if (y > alto && Math.random() > 0.975) {
                gotas[i] = 0;
            }
            gotas[i]++;
        }
        animId = requestAnimationFrame(dibujarFrame);
    }
    dibujarFrame();

    const DURACION_MS = 2200;
    setTimeout(() => {
        cancelAnimationFrame(animId);
        ocultarIntro();
    }, DURACION_MS);
})();
