import * as THREE from "three";

const container = document.getElementById("shape-canvas-container");
if (container) {
    const ACCENT_PRIMARY = 0x18ae91;
    const ACCENT_SECONDARY = 0xbfff9c;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.z = 6.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Figura: dodecaedro en wireframe + vértices brillantes
    const group = new THREE.Group();
    scene.add(group);

    const geometry = new THREE.DodecahedronGeometry(2.2, 0);

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({
        color: ACCENT_PRIMARY,
        transparent: true,
        opacity: 0.75,
    });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    group.add(wireframe);

    const vertexMaterial = new THREE.MeshBasicMaterial({ color: ACCENT_SECONDARY });
    const vertexGeometry = new THREE.SphereGeometry(0.045, 12, 12);
    const positions = geometry.attributes.position;
    const seen = new Set();
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const key = `${x.toFixed(3)}_${y.toFixed(3)}_${z.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const vertexMesh = new THREE.Mesh(vertexGeometry, vertexMaterial);
        vertexMesh.position.set(x, y, z);
        group.add(vertexMesh);
    }

    group.rotation.x = 0.4;
    group.rotation.y = 0.3;

    // Rotación automática + arrastre manual con el cursor
    const AUTO_ROTATE_SPEED = 0.0022;
    const RESUME_DELAY_MS = 1400;
    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    let lastDragTime = 0;

    function onPointerDown(event) {
        isDragging = true;
        lastPointer = { x: event.clientX, y: event.clientY };
        container.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
        if (!isDragging) return;
        const deltaX = event.clientX - lastPointer.x;
        const deltaY = event.clientY - lastPointer.y;
        lastPointer = { x: event.clientX, y: event.clientY };
        group.rotation.y += deltaX * 0.006;
        group.rotation.x += deltaY * 0.006;
        lastDragTime = performance.now();
    }

    function onPointerUp(event) {
        isDragging = false;
        lastDragTime = performance.now();
        if (container.hasPointerCapture(event.pointerId)) {
            container.releasePointerCapture(event.pointerId);
        }
    }

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerUp);

    function animate() {
        requestAnimationFrame(animate);
        if (!isDragging && performance.now() - lastDragTime > RESUME_DELAY_MS) {
            group.rotation.y += AUTO_ROTATE_SPEED;
            group.rotation.x += AUTO_ROTATE_SPEED * 0.4;
        }
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener("resize", () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}
