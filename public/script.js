document.addEventListener('DOMContentLoaded', () => {
    
    // --- NUEVO SISTEMA DE AUTENTICACIÓN Y ESTADO ---
    let appState = {
        requests: [],
        catalog: [],
        fullInventory: [],
        userProfile: null, // { email: '...', role: '...', token: '...' }
        pdfLib: null // Para carga diferida
    };

    // --- ELEMENTOS DEL DOM ---
    const loginView = document.getElementById('login-view');
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loginButtonText = document.getElementById('login-button-text');
    const loginLoader = document.getElementById('login-loader');
    const loginMessage = document.getElementById('login-message');
    const emailInput = document.getElementById('email-input');

    const appContainer = document.getElementById('app-container');
    const mainNav = document.getElementById('main-nav');
    const mainContent = document.getElementById('main-content');
    const adminNavLink = document.getElementById('admin-nav-link');
    const reportsNavLink = document.getElementById('reports-nav-link');
    
    const userProfileMenu = document.getElementById('user-profile-menu');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userRoleDisplay = document.getElementById('user-role-display');
    const logoutButton = document.getElementById('logout-button');

    const loader = document.getElementById('loader');
    const content = document.getElementById('content');
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    
    // Formularios (sin cambios en los IDs)
    const newRequestForm = document.getElementById('new-request-form');
    const newPurchaseRequestForm = document.getElementById('new-purchase-request-form');
    const newEntryForm = document.getElementById('new-entry-form');
    const newCatalogForm = document.getElementById('new-catalog-item-form');
    const newAssetForm = document.getElementById('new-asset-assignment-form');
    const exportAssetsBtn = document.getElementById('export-assets-btn');
    
    const userTableContainer = document.getElementById('requests-table-container');
    const adminTableContainer = document.getElementById('pending-requests-container');
    const newItemSelect = document.getElementById('item-select');
    const newEntryItemSelect = document.getElementById('entry-item-select');
    const assetSelect = document.getElementById('asset-select');


    // --- 1. NUEVA FUNCIÓN DE FETCH AUTENTICADO ---
    /**
     * Reemplazo de 'fetch' que inyecta automáticamente el token de sesión.
     * Todas las llamadas a la API (excepto login) DEBEN usar esto.
     */
    const authenticatedFetch = async (endpoint, options = {}) => {
        if (!appState.userProfile || !appState.userProfile.token) {
            throw new Error('No autenticado.');
        }

        const defaultHeaders = {
            'Content-Type': 'application/json',
            // NUEVO: Envía el token de sesión seguro en lugar de la API key.
            'Authorization': `Bearer ${appState.userProfile.token}`
        };

        // Adjunta el email del usuario al cuerpo si es un POST/PUT
        // Esto permite al backend saber "quién" está haciendo la solicitud.
        if (options.body) {
            let bodyData = JSON.parse(options.body);
            bodyData.userEmail = appState.userProfile.email;
            options.body = JSON.stringify(bodyData);
        } else if (options.method === 'POST' || options.method === 'PUT') {
             options.body = JSON.stringify({ userEmail: appState.userProfile.email });
        }

        options.headers = { ...defaultHeaders, ...options.headers };

        const response = await fetch(endpoint, options);

        if (response.status === 403) {
            // Si el token expira o es inválido, forzar cierre de sesión.
            showToast('Sesión inválida o expirada. Por favor, inicia sesión de nuevo.', true);
            handleLogout();
            throw new Error('Sesión inválida.');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ocurrió un error en la API.');
        }

        return response.json();
    };

    // --- 2. NUEVA LÓGICA DE INICIO Y SESIÓN ---

    /**
     * Punto de entrada principal de la aplicación.
     * Decide si mostrar el Login o la App.
     */
    const bootstrapApp = async () => {
        const urlToken = getUrlToken();

        if (urlToken) {
            // 2a. Hay un token en la URL (viene de un Magic Link)
            await handleTokenVerification(urlToken);
        } else {
            // 2b. No hay token en la URL, buscar sesión en localStorage
            const session = getSessionFromStorage();
            if (session) {
                // Hay una sesión guardada
                appState.userProfile = session;
                await initializeApp();
            } else {
                // No hay sesión, mostrar login
                showLoginView();
            }
        }
    };

    /**
     * Verifica el token del Magic Link con el backend.
     */
    const handleTokenVerification = async (token) => {
        showLoginView('Verificando enlace...');
        try {
            const response = await fetch('/.netlify/functions/verify-session', {
                method: 'POST',
                body: JSON.stringify({ token })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudo verificar el enlace.');
            }

            const profile = await response.json(); // { email, role }
            
            // ¡ÉXITO! Se crea la sesión del cliente.
            appState.userProfile = {
                email: profile.email,
                role: profile.role,
                token: token // El token de un solo uso se convierte en nuestro token de sesión
            };

            // Guardar la sesión y limpiar la URL
            saveSessionToStorage(appState.userProfile);
            window.location.hash = ''; // Limpia el token de la URL

            await initializeApp(); // Cargar la aplicación principal

        } catch (error) {
            showLoginView(error.message, true);
        }
    };

    /**
     * Maneja el envío del formulario de login.
     */
    const handleLoginRequest = async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        if (!email) return;

        loginButton.disabled = true;
        loginButtonText.classList.add('hidden');
        loginLoader.classList.remove('hidden');
        loginMessage.textContent = 'Enviando...';
        
        try {
            const response = await fetch('/.netlify/functions/request-login', {
                method: 'POST',
                body: JSON.stringify({ email })
            });

if (!response.ok) {
                // Si NO fue ok, el 'data' que leímos contiene nuestro error detallado
                // Ej: { error: "Error interno: Conexión SMTP fallida", stack: "..." }
                throw new Error(data.error || 'Error desconocido del servidor');
            }
            // --- FIN DE LA MODIFICACIÓN ---
            showLoginView(data.message); // "Si tu email está registrado..."

        } catch (error) {
            showLoginView(error.message, true);
        }
    };

    const handleLogout = () => {
        // Aquí podríamos llamar a una función /logout que invalide el token
        // en la hoja LOGIN_TOKENS, pero por simplicidad, solo borramos la sesión local.
        localStorage.removeItem('userSession');
        appState.userProfile = null;
        
        // Ocultar app, mostrar login
        appContainer.classList.add('hidden');
        loginView.classList.remove('hidden');
        showLoginView('Has cerrado la sesión.');
    };

    // --- 3. LÓGICA DE LA APLICACIÓN (MODIFICADA) ---

    /**
     * Carga los datos iniciales de la app (catálogo y solicitudes).
     */
    const initializeApp = async () => {
        try {
            // Mostrar la app y ocultar el login
            loginView.classList.add('hidden');
            appContainer.classList.remove('hidden');
            showAppForUser(appState.userProfile);
            
            if (loader) loader.classList.remove('hidden');
            if (content) content.classList.add('hidden');
            
            // Las llamadas ahora usan 'authenticatedFetch'
            const [requestsData, catalogData] = await Promise.all([
                authenticatedFetch('/.netlify/functions/leer-datos', { method: 'POST' }),
                authenticatedFetch('/.netlify/functions/leer-catalogo', { method: 'POST' })
            ]);

            appState.requests = requestsData;
            appState.catalog = catalogData;
            
            renderUserRequestsTable(appState.requests);
            populateCatalogDropdowns();

            if (loader) loader.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            
            showView('dashboard-view');

        } catch (error) {
            showToast(error.message, true);
            if (loader) loader.classList.add('hidden');
            // Si la inicialización falla (ej. token expirado), forzar logout.
            handleLogout();
        }
    };

    /**
     * Configura la UI basada en el rol del usuario.
     */
    const showAppForUser = (profile) => {
        if (!profile) return;

        mainContent.classList.remove('hidden');
        mainNav.classList.remove('hidden');
        
        // Mostrar menú de perfil
        userProfileMenu.classList.remove('hidden');
        userEmailDisplay.textContent = profile.email;
        userRoleDisplay.textContent = profile.role;

        const role = profile.role.trim().toLowerCase();

        if (role === 'admin') {
            adminNavLink.classList.remove('hidden');
            reportsNavLink.classList.remove('hidden');
        } else if (role === 'supervisor') {
            adminNavLink.classList.remove('hidden');
            reportsNavLink.classList.add('hidden');
        } else {
            adminNavLink.classList.add('hidden');
            reportsNavLink.classList.add('hidden');
        }
    };

    /**
     * Carga los datos para la vista de Reportes.
     */
    const loadReportsView = async () => {
        const totalValueEl = document.getElementById('total-inventory-value');
        const lowStockEl = document.getElementById('low-stock-items-container');
        const expiringEl = document.getElementById('expiring-items-container');
        if (!totalValueEl || !lowStockEl || !expiringEl) return;

        totalValueEl.textContent = 'Calculando...';
        lowStockEl.innerHTML = '<p>Calculando...</p>';
        expiringEl.innerHTML = '<p>Calculando...</p>';
        
        try {
            // Usa authenticatedFetch
            const data = await authenticatedFetch('/.netlify/functions/generar-reporte', { method: 'POST' }); 
            
            totalValueEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(data.totalInventoryValue || 0);
            
            if (data.lowStockItems && data.lowStockItems.length > 0) {
                const itemsList = data.lowStockItems.map(item => `<div class="flex justify-between items-center p-2 border-b"><span>${item.name}</span><span class="font-bold text-red-500">${item.stock} / ${item.minStock}</span></div>`).join('');
                lowStockEl.innerHTML = itemsList;
            } else {
                lowStockEl.innerHTML = '<p class="text-gray-500">No hay insumos con stock bajo.</p>';
            }

            if (data.expiringItems && data.expiringItems.length > 0) {
                const expiringList = data.expiringItems.map(item => 
                    `<div class="flex justify-between items-center p-2 border-b">
                        <span>${item.name} (Cant: ${item.quantity})</span>
                        <span class="font-bold text-orange-500">Caduca: ${item.expirationDate}</span>
                    </div>`
                ).join('');
                expiringEl.innerHTML = expiringList;
            } else {
                expiringEl.innerHTML = '<p class="text-gray-500">No hay insumos próximos a caducar.</p>';
            }

        } catch (error) {
            showToast(error.message, true);
            totalValueEl.textContent = 'Error';
            lowStockEl.innerHTML = '<p class="text-red-500">No se pudo cargar el reporte.</p>';
            expiringEl.innerHTML = '<p class="text-red-500">No se pudo cargar el reporte.</p>';
        }
    };

    /**
     * Carga los datos para la vista de Inventario General.
     */
    const renderFullInventory = async () => {
        const container = document.getElementById('full-inventory-container');
        if (!container) return;
        container.innerHTML = '<p>Cargando inventario...</p>';

        try {
            // Usa authenticatedFetch
            const inventory = await authenticatedFetch('/.netlify/functions/leer-inventario-completo', { method: 'POST' });
            appState.fullInventory = inventory;
            renderInventoryTable(inventory);
        } catch (error) {
            container.innerHTML = `<p class="text-red-500">${error.message}</p>`;
        }
    };
    
    /**
     * Carga la librería PDF-Lib dinámicamente bajo demanda.
     */
    const loadPdfLib = async () => {
        if (appState.pdfLib) {
            return appState.pdfLib; // Ya está cargada
        }

        try {
            const pdfLibScript = document.createElement('script');
            pdfLibScript.src = 'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js';
            document.body.appendChild(pdfLibScript);
            
            await new Promise((resolve, reject) => {
                pdfLibScript.onload = resolve;
                pdfLibScript.onerror = reject;
            });
            
            appState.pdfLib = window.PDFLib; // Asigna la librería cargada
            return appState.pdfLib;

        } catch (error) {
            console.error("Error al cargar pdf-lib:", error);
            showToast("No se pudo cargar la librería PDF.", true);
            return null;
        }
    };


    // --- 4. HELPERS DE RENDERIZADO, NAVEGACIÓN Y SESIÓN (Sin cambios mayores, solo llamadas a API) ---

    // (Aquí irían las funciones sin modificar: renderInventoryTable, populateAssetDropdown, 
    // showView, populateCatalogDropdowns, renderUserRequestsTable, 
    // renderPendingRequestsTable, generatePDF, showToast)

    // ... (pegando las funciones sin cambios para que el archivo esté completo) ...

    const showLoginView = (message = '', isError = false) => {
        loginView.classList.remove('hidden');
        appContainer.classList.add('hidden');

        loginButton.disabled = false;
        loginButtonText.classList.remove('hidden');
        loginLoader.classList.add('hidden');

        loginMessage.textContent = message;
        loginMessage.className = `text-center text-sm mt-4 ${isError ? 'text-red-500' : 'text-gray-500'}`;
    };
    
    const getUrlToken = () => {
        const hash = window.location.hash.substring(1); // Quita el '#'
        const params = new URLSearchParams(hash);
        return params.get('token');
    };

    const saveSessionToStorage = (session) => {
        localStorage.setItem('userSession', JSON.stringify(session));
    };

    const getSessionFromStorage = () => {
        const sessionStr = localStorage.getItem('userSession');
        try {
            return JSON.parse(sessionStr);
        } catch (e) {
            return null;
        }
    };
    
    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 p-4 rounded-md text-white ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    };

    const generatePDF = async (payload, catalogItem) => {
        const PDFLib = await loadPdfLib(); // Carga la librería
        if (!PDFLib) return;

        const { PDFDocument, rgb, StandardFonts } = PDFLib;

        // Create a new PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 12;

        // Add Logo
        try {
            const logoUrl = 'logo.png';
            const logoImageBytes = await fetch(logoUrl).then(res => res.arrayBuffer());
            const logoImage = await pdfDoc.embedPng(logoImageBytes);
            const logoDims = logoImage.scale(0.15);
            page.drawImage(logoImage, {
                x: 50,
                y: height - logoDims.height - 50,
                width: logoDims.width,
                height: logoDims.height,
            });
        } catch (err) {
            console.warn("No se pudo cargar el logo.png para el PDF.");
        }


        // Add Title
        const title = 'Responsiva de Activo Fijo';
        const titleSize = 18;
        const titleWidth = font.widthOfTextAtSize(title, titleSize);

        page.drawText('Responsiva de Activo Fijo', {
            x: (width - titleWidth) / 2, 
            y: height - 180, // Posición Y ajustada
            font,
            size: titleSize,
            color: rgb(0, 0, 0),
        });

        // Add Asset Details
        const textY = height - 250;
        const details = [
            `Fecha: ${new Date().toLocaleDateString()}`,
            `ID del Activo: ${payload.assetId}`,
            `Nombre del Activo: ${catalogItem.name}`,
            `SKU: ${catalogItem.sku}`,
            `Responsable: ${payload.responsibleName} (${payload.responsibleEmail})`,
            `Condiciones: ${payload.conditions}`,
        ];

        details.forEach((line, i) => {
            page.drawText(line, {
                x: 50,
                y: textY - (i * 20),
                font,
                size: fontSize,
                color: rgb(0.2, 0.2, 0.2),
            });
        });

        // Add Signature Lines
        const signatureY = 150;
        page.drawText('_________________________', { x: 50, y: signatureY, font, size: fontSize });
        page.drawText('Firma del Colaborador', { x: 70, y: signatureY - 15, font, size: 10 });

        page.drawText('_________________________', { x: width - 200, y: signatureY, font, size: fontSize });
        page.drawText('Firma de Quien Entrega', { x: width - 180, y: signatureY - 15, font, size: 10 });

        // Save and Download
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Responsiva_${payload.assetId}.pdf`;
        link.click();
    };

    const renderInventoryTable = (inventoryData) => {
        const container = document.getElementById('full-inventory-container');
        if (inventoryData.length === 0) {
            container.innerHTML = '<p>No hay productos en el catálogo.</p>';
            return;
        }

        const tableRows = inventoryData.map(item => `
            <tr class="border-b">
                <td class="p-3">${item.sku}</td>
                <td class="p-3">${item.name}</td>
                <td class="p-3">${item.family}</td>
                <td class="p-3 font-bold text-center">${item.stock}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="w-full text-left">
                <thead>
                    <tr class="bg-gray-50 border-b">
                        <th class="p-3 font-semibold text-gray-600">SKU</th>
                        <th class="p-3 font-semibold text-gray-600">Nombre del Producto</th>
                        <th class="p-3 font-semibold text-gray-600">Familia</th>
                        <th class="p-3 font-semibold text-gray-600 text-center">Stock Actual</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
    };

    const populateAssetDropdown = () => {
        if (!assetSelect || !appState.catalog) return;
        const assets = appState.catalog.filter(item => String(item.isAsset).toUpperCase() === 'TRUE');
        
        const defaultOption = '<option value="" disabled selected>Seleccione un activo...</option>';
        const assetOptions = assets.map(item =>
            `<option value="${item.id}">${item.name} (SKU: ${item.sku})</option>`
        ).join('');
        
        assetSelect.innerHTML = defaultOption + assetOptions;
    };

    const showView = (viewId) => {
        views.forEach(view => {
            view.style.display = 'none';
        });

        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.style.display = 'block';
        }
        
        navLinks.forEach(link => {
            const parentLi = link.closest('li');
            if (parentLi) {
                parentLi.classList.toggle('bg-gray-200', link.dataset.view === viewId);
            }
        });
    };

    const populateCatalogDropdowns = () => {
        if (!newItemSelect || !newEntryItemSelect || !appState.catalog) return;
        const defaultOption = '<option value="" disabled selected>Seleccione un insumo...</option>';
        
        // Filtra los que NO son activos fijos para las solicitudes normales
        const consumableItems = appState.catalog.filter(item => String(item.isAsset).toUpperCase() !== 'TRUE');
        
        const catalogOptions = consumableItems.map(item =>
            `<option value="${item.id}">${item.name}</option>`
        ).join('');

        // El dropdown de "Registrar Entrada" debe mostrar TODOS los items
        const allItemsOptions = appState.catalog.map(item =>
            `<option value="${item.id}">${item.name}</option>`
        ).join('');

        newItemSelect.innerHTML = defaultOption + catalogOptions;
        newEntryItemSelect.innerHTML = defaultOption + allItemsOptions;
    };

    const renderUserRequestsTable = (requestsToRender) => {
        if (!userTableContainer) {
            // Si el contenedor no está en la vista (ej. admin-view), buscarlo
            const container = document.getElementById('requests-table-container');
            if (!container) return; // Si sigue sin estar, salir
            container.innerHTML = 'Error al renderizar la tabla.';
            return;
        }

        let contentHTML;
        if (!requestsToRender || requestsToRender.length === 0) {
            contentHTML = '<p class="text-gray-500">No tienes solicitudes por el momento.</p>';
        } else {
            const tableRows = requestsToRender.map(req => {
                const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
                const itemName = catalogItem ? catalogItem.name : (req.item || 'Desconocido');
                return `
                    <tr class="border-b">
                        <td class="p-3">${req.id || 'N/A'}</td>
                        <td class="p-3">${req.email || 'N/A'}</td>
                        <td class="p-3">${itemName}</td>
                        <td class="p-3 text-center">${req.quantity || 'N/A'}</td>
                        <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${req.status === 'Aprobada' ? 'bg-green-100 text-green-800' : req.status === 'Rechazada' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-800'}">${req.status || 'N/A'}</span></td>
                        <td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td>
                    </tr>
                `;
            }).join('');

            contentHTML = `
                <table class="w-full text-left">
                    <thead>
                        <tr class="bg-gray-50 border-b">
                            <th class="p-3 font-semibold text-gray-600">ID</th>
                            <th class="p-3 font-semibold text-gray-600">Solicitante</th>
                            <th class="p-3 font-semibold text-gray-600">Producto</th>
                            <th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th>
                            <th class="p-3 font-semibold text-gray-600">Estatus</th>
                            <th class="p-3 font-semibold text-gray-600">Fecha</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
        }
        userTableContainer.innerHTML = contentHTML;
    };

    const renderPendingRequestsTable = () => {
        if (!adminTableContainer) return;
        const pendingRequests = appState.requests.filter(req => req.status === 'Pendiente');
        
        if (pendingRequests.length === 0) {
            adminTableContainer.innerHTML = '<h3 class="text-xl font-semibold text-gray-800 mb-4">Solicitudes Pendientes</h3><p class="text-gray-500">No hay solicitudes pendientes.</p>';
            return;
        }

        const tableRows = pendingRequests.map(req => {
            const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
            const itemName = catalogItem ? catalogItem.name : (req.item || 'Desconocido');
            return `
                <tr class="border-b">
                    <td class="p-3">${req.email}</td>
                    <td class="p-3">${itemName}</td>
                    <td class="p-3 text-center">${req.quantity}</td>
                    <td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td>
                    <td class="p-3">
                        <button data-id="${req.id}" data-action="Aprobada" class="action-btn bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">Aprobar</button>
                        <button data-id="${req.id}" data-action="Rechazada" class="action-btn bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 ml-2">Rechazar</button>
                    </td>
                </tr>
            `;
        }).join('');

        adminTableContainer.innerHTML = `
            <h3 class="text-xl font-semibold text-gray-800 mb-4">Solicitudes Pendientes</h3>
            <table class="w-full text-left">
                <thead><tr class="bg-gray-50 border-b"><th class="p-3 font-semibold text-gray-600">Usuario</th><th class="p-3 font-semibold text-gray-600">Insumo</th><th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th><th class="p-3 font-semibold text-gray-600">Fecha</th><th class="p-3 font-semibold text-gray-600">Acciones</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
    };


    // --- 5. EVENT LISTENERS (MODIFICADOS PARA USAR authenticatedFetch) ---

    // Listeners de Navegación
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.dataset.view;
            showView(viewId);
            // Carga de datos "Just-in-Time"
            if (viewId === 'admin-view') {
                renderPendingRequestsTable();
                populateAssetDropdown();
            }
            if (viewId === 'reports-view') loadReportsView();
            if (viewId === 'inventory-view') renderFullInventory();
        });
    });

    // Listeners de Autenticación
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginRequest);
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // Listener de Formulario: Nueva Solicitud
    if (newRequestForm) {
        newRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button');
            submitButton.disabled = true;
            
            const payload = {
                id: 'SOL-' + new Date().getTime(), 
                timestamp: new Date().toISOString(), 
                email: appState.userProfile.email, // Email verificado
                item: newItemSelect.value, 
                quantity: parseInt(document.getElementById('quantity-input').value)
                // 'userEmail' se añade automáticamente por authenticatedFetch
            };

            try {
                // Usa authenticatedFetch
                await authenticatedFetch('/.netlify/functions/guardar-datos', { 
                    method: 'POST', 
                    body: JSON.stringify(payload) 
                });
                
                showToast('Solicitud enviada con éxito.');
                newRequestForm.reset();
                
                // Recargar datos y volver al dashboard
                appState.requests = await authenticatedFetch('/.netlify/functions/leer-datos', { method: 'POST' });
                renderUserRequestsTable(appState.requests);
                showView('dashboard-view');
            } catch (error) {
                showToast(`Error: ${error.message}`, true);
            } finally {
                submitButton.disabled = false;
            }
        });
    }
    
    // Listener de Formulario: Registrar Entrada
    if (newEntryForm) {
        newEntryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true; button.textContent = 'Registrando...';
            
            const itemId = document.getElementById('entry-item-select').value;
            const quantity = parseInt(document.getElementById('entry-quantity').value);
            const cost = parseFloat(document.getElementById('entry-cost').value);

            // ... (Validaciones del cliente - sin cambios) ...

            const payload = {
                itemId: itemId, 
                quantity: quantity,
                cost: cost, 
                provider: document.getElementById('entry-provider').value,
                invoice: document.getElementById('entry-invoice').value, 
                expirationDate: document.getElementById('entry-expiration').value,
                serialNumber: document.getElementById('entry-serial').value
            };

            try {
                // Usa authenticatedFetch
                await authenticatedFetch('/.netlify/functions/registrar-entrada', { 
                    method: 'POST', 
                    body: JSON.stringify(payload) 
                });
                
                showToast('Entrada registrada con éxito.');
                newEntryForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false; button.textContent = 'Registrar Entrada';
            }
        });
    }

    // Listener de Formulario: Crear Insumo en Catálogo
    if (newCatalogForm) {
        newCatalogForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true; button.textContent = 'Añadiendo...';
            
            const payload = {
                name: document.getElementById('item-name-input').value, 
                sku: document.getElementById('item-sku-input').value,
                family: document.getElementById('item-family-input').value, 
                unit: document.getElementById('item-unit-input').value,
                description: document.getElementById('item-desc-input').value, 
                minStock: parseInt(document.getElementById('item-min-stock-input').value) || 0,
                maxStock: 0, // Añadido para que coincida con el backend
                location: '', // Añadido para que coincida con el backend
                serialNumber: document.getElementById('item-serial-input').value,
                isAsset: document.getElementById('item-is-asset-input').checked
            };

            try {
                // Usa authenticatedFetch
                await authenticatedFetch('/.netlify/functions/crear-insumo', { 
                    method: 'POST', 
                    body: JSON.stringify(payload) 
                });

                showToast('Insumo añadido al catálogo con éxito.');
                newCatalogForm.reset();
                
                // Recargar catálogo
                appState.catalog = await authenticatedFetch('/.netlify/functions/leer-catalogo', { method: 'POST' });
                populateCatalogDropdowns();

            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false; button.textContent = 'Añadir al Catálogo';
            }
        });
    }

    // Listener de Formulario: Solicitud de Compra
    if (newPurchaseRequestForm) {
        newPurchaseRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Enviando...';

            const payload = {
                itemName: document.getElementById('purchase-item-name').value,
                quantity: parseInt(document.getElementById('purchase-quantity').value),
                justification: document.getElementById('purchase-justification').value,
                especificaciones: document.getElementById('purchase-specifications').value
            };

            try {
                // Usa authenticatedFetch
                await authenticatedFetch('/.netlify/functions/crear-solicitud-compra', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                showToast('Solicitud de compra enviada con éxito.');
                newPurchaseRequestForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false;
                button.textContent = 'Enviar Solicitud de Compra';
            }
        });
    }

    // Listener de Botón: Exportar Activos
    if (exportAssetsBtn) {
        exportAssetsBtn.addEventListener('click', async () => {
            const button = exportAssetsBtn;
            button.disabled = true;
            button.textContent = 'Exportando...';

            try {
                // Usa authenticatedFetch (sin body, el email se añade automáticamente)
                const result = await authenticatedFetch('/.netlify/functions/exportar-activos', {
                    method: 'POST'
                });
                
                showToast(result.message);

            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false;
                button.textContent = 'Exportar Activos';
            }
        });
    }

    // Listener de Formulario: Generar Responsiva
    if (newAssetForm) {
        newAssetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Generando...';

            const payload = {
                assetId: document.getElementById('asset-select').value,
                responsibleName: document.getElementById('responsible-name').value,
                responsibleEmail: document.getElementById('responsible-email').value,
                conditions: document.getElementById('asset-conditions').value
            };
            
            // ... (Validaciones del cliente - sin cambios) ...

            try {
                // Usa authenticatedFetch
                await authenticatedFetch('/.netlify/functions/generar-responsiva', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                const catalogItem = appState.catalog.find(item => item.id === payload.assetId);
                await generatePDF(payload, catalogItem); // Genera PDF en el cliente

                showToast('Responsiva generada con éxito.');
                newAssetForm.reset();
                
                // Recargar datos para reflejar la salida del stock
                appState.requests = await authenticatedFetch('/.netlify/functions/leer-datos', { method: 'POST' });
                renderUserRequestsTable(appState.requests);


            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false;
                button.textContent = 'Generar Responsiva';
            }
        });
    }

    // Listener de Tabla de Admin: Aprobar/Rechazar
    if (adminTableContainer) {
        adminTableContainer.addEventListener('click', async (e) => {
            if (e.target.classList.contains('action-btn')) {
                const button = e.target;
                button.disabled = true; button.textContent = '...';
                const { id, action } = button.dataset;
                try {
                    // Usa authenticatedFetch
                    await authenticatedFetch('/.netlify/functions/actualizar-solicitud', {
                        method: 'POST', 
                        body: JSON.stringify({ 
                            requestId: id, 
                            action: action 
                            // approverEmail se añade automáticamente
                        })
                    });
                    
                    showToast(`Solicitud ${action.toLowerCase()}.`);
                    
                    // Recargar datos
                    appState.requests = await authenticatedFetch('/.netlify/functions/leer-datos', { method: 'POST' });
                    renderUserRequestsTable(appState.requests); // Actualiza la tabla del dashboard
                    renderPendingRequestsTable(); // Actualiza la tabla de admin

                } catch (error) {
                    showToast(error.message, true);
                    button.disabled = false; button.textContent = action;
                }
            }
        });
    }

    // Listeners de Búsqueda (sin cambios)
    document.body.addEventListener('input', (e) => {
        if (e.target.id === 'inventory-search-input') {
            const searchTerm = e.target.value.toLowerCase();
            const filteredInventory = (appState.fullInventory || []).filter(item =>
                item.name.toLowerCase().includes(searchTerm) ||
                item.sku.toLowerCase().includes(searchTerm) ||
                item.family.toLowerCase().includes(searchTerm)
            );
            renderInventoryTable(filteredInventory);
        }

        if (e.target.id === 'search-input') {
            const searchTerm = e.target.value.toLowerCase();
            const userRequests = appState.requests || [];
            const filteredRequests = userRequests.filter(req => {
                const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
                const itemName = catalogItem ? catalogItem.name.toLowerCase() : '';
                return itemName.includes(searchTerm) || (req.status && req.status.toLowerCase().includes(searchTerm));
            });
            renderUserRequestsTable(filteredRequests);
        }
    });

    // --- 6. LLAMADA INICIAL DE LA APLICACIÓN ---
    bootstrapApp();

});