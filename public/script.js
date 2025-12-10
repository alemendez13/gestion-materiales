document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. ESTADO Y VARIABLES GLOBALES
    // ==========================================
    let appState = {
        requests: [],
        catalog: [],
        fullInventory: [],
        currentInventoryView: [], 
        providers: [], // Nuevo para Fase 3
        userProfile: null, 
        pdfLib: null, 
        papaParse: null 
    };

    let purchaseSelection = { stock: [], requests: [] }; // Estado local de compras
    let purchaseDataCache = null;

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
    const purchasesNavLink = document.getElementById('purchases-nav-link'); // Nuevo link
    
    const userProfileMenu = document.getElementById('user-profile-menu');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userRoleDisplay = document.getElementById('user-role-display');
    const logoutButton = document.getElementById('logout-button');

    const loader = document.getElementById('loader');
    const content = document.getElementById('content');
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    
    // Formularios
    const newRequestForm = document.getElementById('new-request-form');
    const newPurchaseRequestForm = document.getElementById('new-purchase-request-form');
    const newEntryForm = document.getElementById('new-entry-form');
    const newCatalogForm = document.getElementById('new-catalog-item-form');
    const newAssetForm = document.getElementById('new-asset-assignment-form');
    
    // Botones y Contenedores
    const exportAssetsBtn = document.getElementById('export-assets-btn');
    const exportInventoryCsvBtn = document.getElementById('export-inventory-csv-btn');
    const bulkImportForm = document.getElementById('bulk-import-form');
    
    const userTableContainer = document.getElementById('requests-table-container');
    const adminTableContainer = document.getElementById('pending-requests-container');
    
    // Inputs para Buscadores
    const newItemSelect = document.getElementById('item-select');
    const newEntryItemSelect = document.getElementById('entry-item-select');
    const assetSelect = document.getElementById('asset-select');

    // Elementos Módulo Compras
    const btnGenerateOrder = document.getElementById('btn-generate-order');
    const purchaseCountSpan = document.getElementById('purchase-count');
    const btnNewProv = document.getElementById('btn-new-provider');
    const modalProv = document.getElementById('new-provider-modal');
    const formProv = document.getElementById('new-provider-form');
    const modalOrder = document.getElementById('order-modal');
    const formOrder = document.getElementById('order-details-form');
    const cancelBtnOrder = document.getElementById('btn-cancel-order');


    // ==========================================
    // 2. FUNCIONES DE RED (FETCH AUTENTICADO)
    // ==========================================

    const authenticatedFetch = async (endpoint, options = {}) => {
        if (!appState.userProfile || !appState.userProfile.token) {
            throw new Error('No autenticado.');
        }

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.userProfile.token}`
        };

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
            showToast('Sesión inválida o expirada. Por favor, inicia sesión de nuevo.', true);
            handleLogout();
            throw new Error('Sesión inválida.');
        }

        if (!response.ok) {
            let errorMsg = 'Ocurrió un error en la API.';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || 'Error desconocido en la API.';
            } catch (jsonError) {
                try {
                    const errorText = await response.text();
                    errorMsg = `Error del servidor: ${errorText}`;
                } catch (textError) {
                    errorMsg = `Error del servidor con respuesta ilegible (Status: ${response.status})`;
                }
            }
            throw new Error(errorMsg);
        }

        return response.json();
    };

    // ==========================================
    // 3. LÓGICA DE SESIÓN Y ARRANQUE
    // ==========================================

    const bootstrapApp = async () => {
        const urlToken = getUrlToken();

        if (urlToken) {
            await handleTokenVerification(urlToken);
        } else {
            const session = getSessionFromStorage();
            if (session) {
                appState.userProfile = session;
                await initializeApp();
            } else {
                showLoginView();
            }
        }
    };

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

            const profile = await response.json(); 
            appState.userProfile = {
                email: profile.email,
                role: profile.role,
                token: profile.token 
            };

            saveSessionToStorage(appState.userProfile);
            window.location.hash = ''; 
            await initializeApp();

        } catch (error) {
            showLoginView(error.message, true);
        }
    };

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
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Error desconocido');
            showLoginView(data.message);

        } catch (error) {
            showLoginView(error.message, true);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('userSession');
        appState.userProfile = null;
        appContainer.classList.add('hidden');
        loginView.classList.remove('hidden');
        showLoginView('Has cerrado la sesión.');
    };

    const initializeApp = async () => {
        try {
            loginView.classList.add('hidden');
            appContainer.classList.remove('hidden');
            showAppForUser(appState.userProfile);
            
            if (loader) loader.classList.remove('hidden');
            if (content) content.classList.add('hidden');
            
            const [requestsData, catalogData] = await Promise.all([
                authenticatedFetch('/.netlify/functions/leer-datos', { method: 'POST' }),
                authenticatedFetch('/.netlify/functions/leer-catalogo', { method: 'POST' })
            ]);

            appState.requests = requestsData;
            appState.catalog = catalogData;
            
            // Inicializaciones
            renderUserRequestsTable(appState.requests); // Con pestañas
            populateCatalogDropdowns(); // Con buscadores

            if (loader) loader.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            
            showView('dashboard-view');

        } catch (error) {
            showToast(error.message, true);
            if (loader) loader.classList.add('hidden');
            handleLogout(); // Si falla la carga inicial, salir
        }
    };

    const showAppForUser = (profile) => {
        if (!profile) return;

        mainContent.classList.remove('hidden');
        mainNav.classList.remove('hidden');
        userProfileMenu.classList.remove('hidden');
        userEmailDisplay.textContent = profile.email;
        userRoleDisplay.textContent = profile.role;

        const role = profile.role.trim().toLowerCase();

        if (role === 'admin') {
            adminNavLink.classList.remove('hidden');
            reportsNavLink.classList.remove('hidden');
            if (purchasesNavLink) purchasesNavLink.classList.remove('hidden');
        } else if (role === 'supervisor') {
            adminNavLink.classList.remove('hidden');
            reportsNavLink.classList.add('hidden');
            if (purchasesNavLink) purchasesNavLink.classList.add('hidden');
        } else {
            adminNavLink.classList.add('hidden');
            reportsNavLink.classList.add('hidden');
            if (purchasesNavLink) purchasesNavLink.classList.add('hidden');
        }
    };

    // ==========================================
    // 4. HELPERS Y UTILIDADES (UI/LIBS)
    // ==========================================

    const showView = (viewId) => {
        views.forEach(view => view.style.display = 'none');
        const activeView = document.getElementById(viewId);
        if (activeView) activeView.style.display = 'block';
        
        navLinks.forEach(link => {
            const parentLi = link.closest('li');
            if (parentLi) parentLi.classList.toggle('bg-gray-200', link.dataset.view === viewId);
        });
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

    // ==========================================
    // FUNCIONES RECUPERADAS (FALTANTES)
    // ==========================================

    const showLoginView = (message = '', isError = false) => {
        loginView.classList.remove('hidden');
        appContainer.classList.add('hidden');

        loginButton.disabled = false;
        loginButtonText.classList.remove('hidden');
        loginLoader.classList.add('hidden');

        if (loginMessage) {
            loginMessage.textContent = message;
            loginMessage.className = `text-center text-sm mt-4 ${isError ? 'text-red-500' : 'text-gray-500'}`;
        }
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

    // ==========================================
    // FIN FUNCIONES RECUPERADAS
    // ==========================================

    const setupSearchableDropdown = (searchInputId, hiddenInputId, resultsListId, dataItems, onSelectCallback) => {
        const searchInput = document.getElementById(searchInputId);
        const hiddenInput = document.getElementById(hiddenInputId);
        const resultsList = document.getElementById(resultsListId);

        if (!searchInput || !hiddenInput || !resultsList) return;

        const renderList = (filterText = '') => {
            resultsList.innerHTML = '';
            const normalizedFilter = filterText.toLowerCase();
            const filtered = dataItems.filter(item => 
                item.label.toLowerCase().includes(normalizedFilter) || 
                (item.details && item.details.toLowerCase().includes(normalizedFilter))
            );

            if (filtered.length === 0) {
                resultsList.innerHTML = '<li class="p-2 text-gray-500 text-sm">No hay coincidencias</li>';
            } else {
                filtered.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'search-result-item';
                    const detailsSpan = item.details ? `<span class="text-xs text-gray-400 ml-2">(${item.details})</span>` : '';
                    li.innerHTML = `${item.label} ${detailsSpan}`;
                    
                    li.addEventListener('click', () => {
                        searchInput.value = item.label;
                        hiddenInput.value = item.id;
                        resultsList.classList.add('hidden');
                        if (onSelectCallback) onSelectCallback(item);
                    });
                    resultsList.appendChild(li);
                });
            }
            resultsList.classList.remove('hidden');
        };

        searchInput.addEventListener('input', (e) => {
            renderList(e.target.value);
            hiddenInput.value = '';
        });

        searchInput.addEventListener('focus', () => {
            if(!hiddenInput.value) renderList(searchInput.value);
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsList.contains(e.target)) {
                resultsList.classList.add('hidden');
            }
        });
    };

    const loadPdfLib = async () => {
        if (appState.pdfLib) return appState.pdfLib;
        try {
            const pdfLibScript = document.createElement('script');
            pdfLibScript.src = 'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js';
            document.body.appendChild(pdfLibScript);
            await new Promise((resolve, reject) => {
                pdfLibScript.onload = resolve;
                pdfLibScript.onerror = reject;
            });
            appState.pdfLib = window.PDFLib;
            return appState.pdfLib;
        } catch (error) { console.error(error); return null; }
    };

    const loadPapaParse = async () => {
        if (appState.papaParse) return appState.papaParse;
        try {
            const papaParseScript = document.createElement('script');
            papaParseScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
            document.body.appendChild(papaParseScript);
            await new Promise((resolve, reject) => {
                papaParseScript.onload = resolve;
                papaParseScript.onerror = reject;
            });
            appState.papaParse = window.Papa;
            return appState.papaParse;
        } catch (error) { console.error(error); return null; }
    };

    // ==========================================
    // 5. RENDERIZADO DE DATOS (TABLAS Y VISTAS)
    // ==========================================

    const populateCatalogDropdowns = () => {
        if (!appState.catalog) return;
        // 1. Nueva Solicitud (Excluye Activos)
        const consumableItems = appState.catalog.filter(item => String(item.isAsset).toUpperCase() !== 'TRUE');
        const consumableData = consumableItems.map(item => ({ id: item.id, label: item.name, details: `SKU: ${item.sku}` }));
        setupSearchableDropdown('item-search-input', 'item-select', 'item-search-results', consumableData);

        // 2. Entrada Mercancía (Todos)
        const allItemsData = appState.catalog.map(item => ({ id: item.id, label: item.name, details: `SKU: ${item.sku}` }));
        setupSearchableDropdown('entry-search-input', 'entry-item-select', 'entry-search-results', allItemsData, (selectedItem) => {
            const descriptionEl = document.getElementById('entry-item-description');
            const fullItem = appState.catalog.find(i => i.id === selectedItem.id);
            if (descriptionEl) descriptionEl.textContent = fullItem.description || "(Sin descripción)";
        });
    };

    const populateAssetDropdown = () => {
        if (!appState.catalog) return;
        const assets = appState.catalog.filter(item => String(item.isAsset).toUpperCase() === 'TRUE');
        const assetData = assets.map(item => ({ id: item.id, label: item.name, details: `SKU: ${item.sku}` }));
        setupSearchableDropdown('asset-search-input', 'asset-select', 'asset-search-results', assetData);
    };

    // ==========================================
    // FUNCIONES RECUPERADAS: REPORTES E INVENTARIO
    // ==========================================

    const loadReportsView = async () => {
        const totalValueEl = document.getElementById('total-inventory-value');
        const lowStockEl = document.getElementById('low-stock-items-container');
        const expiringEl = document.getElementById('expiring-items-container');
        
        // Si el DOM de reportes no existe (estás en otra vista), salir
        if (!totalValueEl || !lowStockEl || !expiringEl) return;

        totalValueEl.textContent = 'Calculando...';
        lowStockEl.innerHTML = '<p>Calculando...</p>';
        expiringEl.innerHTML = '<p>Calculando...</p>';
        
        try {
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

    const renderFullInventory = async () => {
        const container = document.getElementById('full-inventory-container');
        if (!container) return;
        container.innerHTML = '<p>Cargando inventario...</p>';

        try {
            const inventory = await authenticatedFetch('/.netlify/functions/leer-inventario-completo', { method: 'POST' });
            appState.fullInventory = inventory;
            appState.currentInventoryView = inventory;
            renderInventoryTable(inventory);
        } catch (error) {
            container.innerHTML = `<p class="text-red-500">${error.message}</p>`;
        }
    };

    // --- TABLA DE SOLICITUDES (DASHBOARD) CON PESTAÑAS ---
    const renderUserRequestsTable = (requestsToRender) => {
        // Verificar contenedores de pestañas
        const containerPending = document.getElementById('requests-pending-container');
        const containerApproved = document.getElementById('requests-approved-container');
        const containerRejected = document.getElementById('requests-rejected-container');
        
        // Fallback para HTML antiguo
        if (!containerPending) {
            const oldContainer = document.getElementById('requests-table-container');
            if(oldContainer) oldContainer.innerHTML = '<p class="text-red-500">Error: HTML no actualizado. Faltan pestañas.</p>';
            return;
        }

        // Filtrar
        const pending = requestsToRender.filter(r => r.status === 'Pendiente');
        const approved = requestsToRender.filter(r => r.status === 'Aprobada');
        const rejected = requestsToRender.filter(r => r.status === 'Rechazada');

        // Actualizar contador
        const countBadge = document.getElementById('count-pending');
        if (countBadge) countBadge.textContent = pending.length;

        // Generador HTML
        const generateTableHTML = (requests, emptyMessage) => {
            if (!requests || requests.length === 0) return `<p class="text-gray-500 italic p-4">${emptyMessage}</p>`;
            const rows = requests.map(req => {
                const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
                const itemName = catalogItem ? catalogItem.name : (req.item || 'Desconocido');
                let statusColor = req.status === 'Aprobada' ? 'bg-green-100 text-green-800' : (req.status === 'Rechazada' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800');
                return `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-medium">${itemName}</td><td class="p-3 text-center">${req.quantity}</td><td class="p-3"><span class="px-2 py-1 text-xs rounded-full ${statusColor}">${req.status}</span></td><td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td><td class="p-3 text-xs text-gray-400 hidden md:table-cell">${req.id}</td></tr>`;
            }).join('');
            return `<div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="p-3">Producto</th><th class="p-3 text-center">Cant.</th><th class="p-3">Estatus</th><th class="p-3">Fecha</th><th class="p-3 hidden md:table-cell">ID Ref</th></tr></thead><tbody class="divide-y divide-gray-100">${rows}</tbody></table></div>`;
        };

        containerPending.innerHTML = generateTableHTML(pending, "No hay pendientes.");
        containerApproved.innerHTML = generateTableHTML(approved, "No hay aprobadas.");
        containerRejected.innerHTML = generateTableHTML(rejected, "No hay rechazadas.");
    };

    const setupDashboardTabs = () => {
        const tabButtons = document.querySelectorAll('.request-tab-btn');
        const tabContents = document.querySelectorAll('.request-tab-content');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                tabButtons.forEach(b => {
                    b.classList.remove('border-blue-500', 'text-blue-600');
                    b.classList.add('border-transparent', 'text-gray-500');
                });
                btn.classList.remove('border-transparent', 'text-gray-500');
                btn.classList.add('border-blue-500', 'text-blue-600');
                tabContents.forEach(content => {
                    content.classList.toggle('hidden', content.id !== targetId);
                    content.classList.toggle('block', content.id === targetId);
                });
            });
        });
    };

    // --- TABLA ADMIN ---
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
            return `<tr class="border-b"><td class="p-3">${req.email}</td><td class="p-3">${itemName}</td><td class="p-3 text-center">${req.quantity}</td><td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td><td class="p-3"><button data-id="${req.id}" data-action="Aprobada" class="action-btn bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">Aprobar</button> <button data-id="${req.id}" data-action="Rechazada" class="action-btn bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 ml-2">Rechazar</button></td></tr>`;
        }).join('');
        adminTableContainer.innerHTML = `<h3 class="text-xl font-semibold text-gray-800 mb-4">Solicitudes Pendientes</h3><table class="w-full text-left"><thead><tr class="bg-gray-50 border-b"><th class="p-3 font-semibold text-gray-600">Usuario</th><th class="p-3 font-semibold text-gray-600">Insumo</th><th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th><th class="p-3 font-semibold text-gray-600">Fecha</th><th class="p-3 font-semibold text-gray-600">Acciones</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    };

    const renderInventoryTable = (inventoryData) => {
        const container = document.getElementById('full-inventory-container');
        if (inventoryData.length === 0) { container.innerHTML = '<p>No hay productos.</p>'; return; }
        const tableRows = inventoryData.map(item => `<tr class="border-b"><td class="p-3">${item.sku}</td><td class="p-3">${item.name}</td><td class="p-3">${item.family}</td><td class="p-3 font-bold text-center">${item.stock}</td><td class="p-3">${item.location || ''}</td></tr>`).join('');
        container.innerHTML = `<table class="w-full text-left"><thead><tr class="bg-gray-50 border-b"><th class="p-3">SKU</th><th class="p-3">Producto</th><th class="p-3">Familia</th><th class="p-3 text-center">Stock</th><th class="p-3">Ubicación</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    };


    // ==========================================
    // 6. MÓDULO DE COMPRAS Y PROVEEDORES
    // ==========================================

    const loadPurchasesView = async () => {
        const stockListEl = document.getElementById('purchase-stock-list');
        const reqListEl = document.getElementById('purchase-requests-list');
        stockListEl.innerHTML = '<div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-6 w-6 mx-auto"></div>';
        reqListEl.innerHTML = '<div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-6 w-6 mx-auto"></div>';

        try {
            const data = await authenticatedFetch('/.netlify/functions/obtener-datos-compras', { method: 'POST' });
            purchaseDataCache = data;
            renderPurchaseLists(data);
        } catch (error) {
            showToast(error.message, true);
            stockListEl.innerHTML = '<p class="text-red-500 text-sm">Error al cargar.</p>';
            reqListEl.innerHTML = '<p class="text-red-500 text-sm">Error al cargar.</p>';
        }
    };

    const loadProviders = async () => {
        try {
            const providers = await authenticatedFetch('/.netlify/functions/leer-proveedores', { method: 'POST' });
            appState.providers = providers;
            const providerData = providers.map(p => ({ id: p.id, label: p.name, details: p.contact ? `Contacto: ${p.contact}` : '', originalData: p }));

            setupSearchableDropdown('provider-search-input', 'provider-select', 'provider-search-results', providerData, (selected) => {
                const fullData = selected.originalData;
                document.getElementById('provider-email-display').textContent = fullData.email || 'Sin email registrado';
                
                const selectedItemsNames = [...purchaseSelection.stock.map(i => i.name), ...purchaseSelection.requests.map(i => i.name)];
                let hintText = '';
                if (fullData.priceHistory) {
                    selectedItemsNames.forEach(name => {
                        if (fullData.priceHistory[name]) {
                            hintText += `Último precio de "${name}": $${fullData.priceHistory[name].cost} (${fullData.priceHistory[name].date}). `;
                        }
                    });
                }
                document.getElementById('price-history-hint').textContent = hintText || 'No hay historial de precios para estos ítems.';
            });
        } catch (error) { console.error("Error cargando proveedores", error); }
    };

    const renderPurchaseLists = (data) => {
        const stockListEl = document.getElementById('purchase-stock-list');
        const reqListEl = document.getElementById('purchase-requests-list');
        purchaseSelection = { stock: [], requests: [] };
        updatePurchaseUI();

        if (data.lowStockItems.length === 0) stockListEl.innerHTML = '<p class="text-gray-500 text-sm p-2">Todo el stock está saludable.</p>';
        else stockListEl.innerHTML = data.lowStockItems.map((item, index) => `<div class="flex items-start p-3 border-b bg-white hover:bg-red-50 transition"><input type="checkbox" class="mt-1 mr-3 h-4 w-4 text-red-600 purchase-checkbox" data-type="stock" data-index="${index}"><div class="flex-1"><p class="font-semibold text-gray-800">${item.name}</p><div class="flex justify-between text-xs text-gray-600 mt-1"><span>Stock: <strong class="text-red-600">${item.currentStock}</strong> / Min: ${item.minStock}</span><span class="bg-red-100 text-red-800 px-2 py-0.5 rounded">Sugerido: +${item.suggestedQty} ${item.unit || ''}</span></div></div></div>`).join('');

        if (data.purchaseRequests.length === 0) reqListEl.innerHTML = '<p class="text-gray-500 text-sm p-2">No hay solicitudes pendientes.</p>';
        else reqListEl.innerHTML = data.purchaseRequests.map((req, index) => `<div class="flex items-start p-3 border-b bg-white hover:bg-blue-50 transition"><input type="checkbox" class="mt-1 mr-3 h-4 w-4 text-blue-600 purchase-checkbox" data-type="request" data-index="${index}"><div class="flex-1"><p class="font-semibold text-gray-800">${req.name}</p><p class="text-xs text-gray-500">Por: ${req.requester}</p><div class="mt-1 text-xs bg-gray-100 p-1 rounded"><span class="font-bold">Cant: ${req.quantity}</span> - ${req.justification || 'Sin justificación'}</div></div></div>`).join('');

        document.querySelectorAll('.purchase-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const type = e.target.dataset.type;
                const index = e.target.dataset.index;
                const item = type === 'stock' ? purchaseDataCache.lowStockItems[index] : purchaseDataCache.purchaseRequests[index];
                if (e.target.checked) { if (type === 'stock') purchaseSelection.stock.push(item); else purchaseSelection.requests.push(item); }
                else { if (type === 'stock') purchaseSelection.stock = purchaseSelection.stock.filter(i => i.id !== item.id); else purchaseSelection.requests = purchaseSelection.requests.filter(i => i.id !== item.id); }
                updatePurchaseUI();
            });
        });
    };

    const updatePurchaseUI = () => {
        const total = purchaseSelection.stock.length + purchaseSelection.requests.length;
        if (purchaseCountSpan) purchaseCountSpan.textContent = total;
        if (btnGenerateOrder) btnGenerateOrder.disabled = total === 0;
    };

    // =========================================================
    // NUEVA LÓGICA DE COMPRAS (Reemplaza a la anterior)
    // =========================================================

    // 1. Renderizar la Tabla Dinámica en el Modal (VERSIÓN ESTABILIZADA)
    const renderOrderTable = () => {
        const tbody = document.getElementById('order-items-body');
        const grandTotalEl = document.getElementById('order-grand-total');
        
        // Limpiamos la tabla
        tbody.innerHTML = '';

        // Unimos stock seleccionado + solicitudes seleccionadas
        const allItems = [...purchaseSelection.stock, ...purchaseSelection.requests];
        
        if (allItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay ítems seleccionados.</td></tr>';
            grandTotalEl.textContent = '$0.00';
            return;
        }

        allItems.forEach((item, index) => {
            const row = document.createElement('tr');
            
            // INTELIGENCIA: Buscamos si este item tiene un proveedor sugerido en el catálogo
            // Usamos una búsqueda insensible a mayúsculas/minúsculas para mayor robustez
            const catalogItem = appState.catalog.find(c => c.name.toLowerCase() === item.name.toLowerCase()); 
            const suggestedProvName = catalogItem ? catalogItem.suggestedProvider : '';
            
            // Cantidad sugerida o solicitada
            const qty = item.suggestedQty || item.quantity || 1;

            row.innerHTML = `
                <td class="p-2 border-b">
                    <p class="font-medium truncate text-gray-800" title="${item.name}">${item.name}</p>
                    <span class="text-xs text-gray-400">${item.type === 'SOLICITUD' ? 'Solicitud Usuario' : 'Reposición Stock'}</span>
                </td>
                <td class="p-2 text-center border-b">${qty}</td>
                <td class="p-2 border-b">
                    <select class="order-provider-select w-full border border-gray-300 rounded p-1 text-sm bg-white focus:ring-blue-500 focus:border-blue-500" data-index="${index}">
                        <option value="">-- Seleccionar --</option>
                        ${appState.providers.map(p => `
                            <option value="${p.id}" ${p.name.trim().toLowerCase() === suggestedProvName.trim().toLowerCase() ? 'selected' : ''}>${p.name}</option>
                        `).join('')}
                    </select>
                </td>
                <td class="p-2 border-b">
                    <input type="number" min="0" step="0.01" class="order-cost-input w-full border border-gray-300 rounded p-1 text-right focus:ring-blue-500 focus:border-blue-500" placeholder="0.00" data-qty="${qty}" data-index="${index}">
                </td>
                <td class="p-2 text-right font-medium text-gray-700 border-b order-row-total" id="row-total-${index}">$0.00</td>
            `;
            tbody.appendChild(row);
        });

        // --- MEJORA DE ESTABILIDAD: Esperar un ciclo de renderizado ---
        setTimeout(() => {
            // 1. Listeners de cálculo (costo)
            document.querySelectorAll('.order-cost-input').forEach(input => {
                input.addEventListener('input', calculateOrderTotals);
            });
            
            // 2. Listeners de cambio de proveedor + Auto-llenado inteligente
            document.querySelectorAll('.order-provider-select').forEach(select => {
                select.addEventListener('change', (e) => {
                    const provId = e.target.value;
                    const index = e.target.dataset.index;
                    const item = allItems[index];
                    
                    const provider = appState.providers.find(p => p.id === provId);
                    // Lógica de historial de precios
                    if (provider && provider.priceHistory && provider.priceHistory[item.name]) {
                        const lastPrice = provider.priceHistory[item.name].cost;
                        const input = document.querySelector(`.order-cost-input[data-index="${index}"]`);
                        if(input && !input.value) { 
                            input.value = lastPrice;
                            calculateOrderTotals(); 
                        }
                    }
                });

                // Disparar evento 'change' manualmente si ya hay un proveedor pre-seleccionado (Sugerido)
                // Esto hará que se busque su precio histórico automáticamente al abrir el modal
                if (select.value) {
                    select.dispatchEvent(new Event('change'));
                }
            });
        }, 50); // 50ms de retraso es imperceptible para el ojo humano pero una eternidad para el CPU
    };

    // 2. Función para Calcular Totales en Tiempo Real
    const calculateOrderTotals = () => {
        let grandTotal = 0;
        document.querySelectorAll('.order-cost-input').forEach(input => {
            const qty = parseFloat(input.dataset.qty);
            const cost = parseFloat(input.value) || 0;
            const total = qty * cost;
            const index = input.dataset.index;
            
            // Actualizar celda de total por fila
            document.getElementById(`row-total-${index}`).textContent = `$${total.toFixed(2)}`;
            grandTotal += total;
        });
        // Actualizar Total Final
        document.getElementById('order-grand-total').textContent = `$${grandTotal.toFixed(2)}`;
    };

    // 3. Listener del Botón "Autorizar y Generar Orden"
    if (btnGenerateOrder) {
        btnGenerateOrder.addEventListener('click', () => {
            // Renderizamos la tabla ANTES de mostrar el modal
            renderOrderTable();
            document.getElementById('order-modal').classList.remove('hidden');
        });
    }

    // 4. Listener del Submit (Confirmar Orden) - VERSIÓN CORREGIDA Y BLINDADA
    if (formOrder) {
        formOrder.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = formOrder.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.disabled = true; btn.textContent = 'Procesando...';

            // --- PARCHE DE SEGURIDAD 1: Validar Inputs Fijos ---
            // Esto evita el error "Cannot read properties of null" si el HTML no cargó bien
            const dateEl = document.getElementById('order-date');
            const notesEl = document.getElementById('order-notes');

            if (!dateEl) {
                console.error("ERROR CRÍTICO: No se encuentra el input 'order-date' en el HTML.");
                showToast("Error de sistema: Faltan campos en el formulario. Recarga la página.", true);
                btn.disabled = false; btn.textContent = originalText;
                return;
            }
            // ----------------------------------------------------

            // Recolectar datos fila por fila con validación extra
            const itemsDetails = [];
            const allItemsSource = [...purchaseSelection.stock, ...purchaseSelection.requests];
            let grandTotal = 0;
            let hasError = false;

            const costInputs = document.querySelectorAll('.order-cost-input');
            const provSelects = document.querySelectorAll('.order-provider-select');

            // --- PARCHE DE SEGURIDAD 2: Validar Tabla ---
            if (costInputs.length === 0 || costInputs.length !== provSelects.length) {
                console.error(`Desfase en tabla: Inputs=${costInputs.length}, Selects=${provSelects.length}`);
                showToast("Error al leer la tabla de precios. Intenta abrir el modal de nuevo.", true);
                btn.disabled = false; btn.textContent = originalText;
                return;
            }
            // ---------------------------------------------

            costInputs.forEach((input, idx) => {
                const cost = parseFloat(input.value);
                const provSelect = provSelects[idx]; // Acceso seguro por índice
                
                // Protección extra por si un selector falló
                if (!provSelect) return; 
                
                const providerId = provSelect.value;
                
                // Validación: Todo debe tener proveedor y costo
                if (!providerId || isNaN(cost)) {
                    hasError = true;
                    input.classList.add('border-red-500'); 
                    provSelect.classList.add('border-red-500');
                } else {
                    input.classList.remove('border-red-500');
                    provSelect.classList.remove('border-red-500');
                    
                    const itemData = allItemsSource[idx];
                    const provider = appState.providers.find(p => p.id === providerId);
                    
                    // Protección por si el array de datos origen no coincide
                    if (itemData) {
                        itemsDetails.push({
                            ...itemData, 
                            unitCost: cost,
                            providerId: providerId,
                            providerName: provider ? provider.name : 'Desconocido',
                            quantity: parseFloat(input.dataset.qty)
                        });
                        grandTotal += (cost * parseFloat(input.dataset.qty));
                    }
                }
            });

            if (hasError) {
                showToast('Por favor asigna proveedor y costo a todos los ítems marcados en rojo.', true);
                btn.disabled = false; btn.textContent = originalText;
                return;
            }

            // Datos Generales de la Orden (Usando las referencias seguras de arriba)
            const orderData = {
                deliveryDate: dateEl.value, 
                notes: notesEl ? notesEl.value : '', // Si notesEl no existe, manda string vacío
                totalOrderCost: grandTotal.toFixed(2),
                providerName: 'Múltiples / Ver Detalle', 
                providerEmail: '' 
            };

            try {
                // Generar PDF
                const pdfBase64 = await generatePurchaseOrderPDF(orderData, itemsDetails);
                
                // Enviar al Backend
                await authenticatedFetch('/.netlify/functions/procesar-orden-compra', { 
                    method: 'POST', 
                    body: JSON.stringify({ pdfBase64, orderData, itemsDetails }) 
                });
                
                showToast('Orden procesada y trazabilidad actualizada.');
                document.getElementById('order-modal').classList.add('hidden');
                formOrder.reset();
                loadPurchasesView(); 
            } catch(err) { 
                console.error("Error en proceso de compra:", err); 
                showToast(err.message, true); 
            } finally { 
                btn.disabled = false; btn.textContent = originalText; 
            }
        });
    }

    // 5. Nuevo Generador de PDF (Con columnas de precios)
    const generatePurchaseOrderPDF = async (orderData, items) => {
         const PDFLib = await loadPdfLib();
         if (!PDFLib) throw new Error('Error al cargar librería PDF');
         const { PDFDocument, rgb, StandardFonts } = PDFLib;
         const pdfDoc = await PDFDocument.create();
         const page = pdfDoc.addPage();
         const { width, height } = page.getSize();
         const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
         const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
         
         let yPos = height - 50;
         
         // Título
         page.drawText('ORDEN DE COMPRA', { x: 50, y: yPos, size: 20, font: fontBold, color: rgb(0, 0.53, 0.71) });
         yPos -= 30;
         
         // Fecha y Datos
         page.drawText(`Fecha: ${new Date().toLocaleDateString()}`, { x: 50, y: yPos, size: 10, font });
         page.drawText(`Entrega Estimada: ${orderData.deliveryDate}`, { x: 300, y: yPos, size: 10, font });
         yPos -= 40;

         // Encabezados de Tabla
         const startX = 40;
         page.drawRectangle({ x: startX, y: yPos - 5, width: 520, height: 20, color: rgb(0.9, 0.9, 0.9) });
         
         page.drawText('CANT', { x: 45, y: yPos, size: 8, font: fontBold });
         page.drawText('DESCRIPCIÓN', { x: 85, y: yPos, size: 8, font: fontBold });
         page.drawText('PROVEEDOR', { x: 280, y: yPos, size: 8, font: fontBold });
         page.drawText('P. UNIT', { x: 430, y: yPos, size: 8, font: fontBold });
         page.drawText('TOTAL', { x: 500, y: yPos, size: 8, font: fontBold });
         
         yPos -= 20;

         // Filas
         items.forEach(item => {
             const totalRow = item.quantity * item.unitCost;
             
             // Verificar si necesitamos nueva página
             if (yPos < 50) { 
                 // (Aquí iría lógica de nueva página, simplificado para este ejemplo)
             }

             page.drawText(String(item.quantity), { x: 45, y: yPos, size: 8, font });
             page.drawText(item.name.substring(0, 35), { x: 85, y: yPos, size: 8, font });
             page.drawText(item.providerName.substring(0, 25), { x: 280, y: yPos, size: 8, font });
             page.drawText(`$${item.unitCost.toFixed(2)}`, { x: 430, y: yPos, size: 8, font });
             page.drawText(`$${totalRow.toFixed(2)}`, { x: 500, y: yPos, size: 8, font });
             
             // Línea divisoria suave
             page.drawLine({ start: { x: 40, y: yPos - 5 }, end: { x: 560, y: yPos - 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
             
             yPos -= 20;
         });
         
         // Total Final
         yPos -= 10;
         page.drawText(`TOTAL FINAL: $${orderData.totalOrderCost}`, { x: 430, y: yPos, size: 12, font: fontBold });

         // Notas
         if (orderData.notes) {
             yPos -= 30;
             page.drawText(`Notas: ${orderData.notes}`, { x: 40, y: yPos, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
         }

         return await pdfDoc.saveAsBase64({ dataUri: false });
    };

    // Botón de cierre X del modal (si existe)
    document.getElementById('btn-cancel-order-x')?.addEventListener('click', () => {
         document.getElementById('order-modal').classList.add('hidden');
    });


    // ==========================================
    // 7. EVENT LISTENERS Y ARRANQUE
    // ==========================================

    // Navegación
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.dataset.view;
            showView(viewId);
            if (viewId === 'admin-view') { renderPendingRequestsTable(); populateAssetDropdown(); }
            if (viewId === 'reports-view') loadReportsView();
            if (viewId === 'inventory-view') renderFullInventory();
            if (viewId === 'purchases-view') { loadPurchasesView(); loadProviders(); }
        });
    });

    // ==========================================
    // LISTENER FALTANTE: ACORDEÓN DE REPORTES
    // ==========================================
    if (mainContent) {
        mainContent.addEventListener('click', (e) => {
            // Detectar si el clic fue en el botón de desplegar (o en su ícono)
            const toggleButton = e.target.closest('.report-toggle-btn');
            
            if (!toggleButton) return; // Si no fue en el botón, no hacer nada

            e.preventDefault();
            
            // Identificar qué sección abrir (basado en el data-target del HTML)
            const targetId = toggleButton.dataset.target;
            const targetContent = document.getElementById(targetId);
            const icon = toggleButton.querySelector('.toggle-icon');

            if (!targetContent || !icon) return;

            // Alternar la clase 'hidden' para mostrar/ocultar
            targetContent.classList.toggle('hidden');

            // Cambiar el ícono de la flecha (expand_more / expand_less)
            if (targetContent.classList.contains('hidden')) {
                icon.textContent = 'expand_more';
            } else {
                icon.textContent = 'expand_less';
            }
        });
    }

    // Auth
    if (loginForm) loginForm.addEventListener('submit', handleLoginRequest);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    // Forms
    if (newRequestForm) newRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // ... Lógica de envío de solicitud ...
        // (Simplificada aquí para brevedad, usar la lógica original)
        const payload = { id: 'SOL-'+Date.now(), timestamp: new Date().toISOString(), email: appState.userProfile.email, item: newItemSelect.value, quantity: document.getElementById('quantity-input').value };
        try { await authenticatedFetch('/.netlify/functions/guardar-datos', { method:'POST', body:JSON.stringify(payload)}); showToast('Enviado'); newRequestForm.reset(); appState.requests = await authenticatedFetch('/.netlify/functions/leer-datos', {method:'POST'}); renderUserRequestsTable(appState.requests); showView('dashboard-view'); } catch(e){ showToast(e.message, true); }
    });

    // --- CORRECCIÓN BOTONES ADMIN (Aprobar/Rechazar) ---
    if (adminTableContainer) {
        adminTableContainer.addEventListener('click', async (e) => {
            // Verificar si el clic fue en un botón con la clase 'action-btn'
            const button = e.target.closest('.action-btn');
            if (!button) return; // Si no es un botón de acción, ignorar

            e.preventDefault();

            const requestId = button.dataset.id;
            const action = button.dataset.action; // "Aprobada" o "Rechazada"

            // Feedback visual inmediato (Deshabilitar botón para evitar doble clic)
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = "Procesando...";

            try {
                await authenticatedFetch('/.netlify/functions/actualizar-solicitud', {
                    method: 'POST',
                    body: JSON.stringify({ requestId, action })
                });

                showToast(`Solicitud ${action.toLowerCase()} correctamente.`);
                
                // Recargar datos para actualizar la tabla
                const requestsData = await authenticatedFetch('/.netlify/functions/leer-datos', { method: 'POST' });
                // ... dentro del try del adminTableContainer ...
                appState.requests = requestsData;

                // 1. Actualiza la tabla de Administración (Lo que ya tenías)
                renderPendingRequestsTable(); 

                // 2. AGREGAR ESTA LÍNEA: Actualiza la tabla del Dashboard (Mis Solicitudes)
                renderUserRequestsTable(appState.requests);

            } catch (error) {
                console.error(error);
                showToast(`Error: ${error.message}`, true);
                // Restaurar botón si hubo error
                button.disabled = false;
                button.textContent = originalText;
            }
        });
    }
    // --- FIN CORRECCIÓN ---

    // --- INICIO MODIFICACIÓN FASE 2 ---
    if (newPurchaseRequestForm) {
        newPurchaseRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = newPurchaseRequestForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true; submitBtn.textContent = "Enviando...";

            const payload = {
                itemName: document.getElementById('purchase-item-name').value,
                quantity: document.getElementById('purchase-quantity').value,
                justification: document.getElementById('purchase-justification').value,
                especificaciones: document.getElementById('purchase-specifications').value
            };

            try {
                await authenticatedFetch('/.netlify/functions/crear-solicitud-compra', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                showToast('Solicitud de compra enviada correctamente.');
                newPurchaseRequestForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                submitBtn.disabled = false; submitBtn.textContent = originalText;
            }
        });
    }
    // --- FIN MODIFICACIÓN FASE 2 ---
    
    // Purchase Order Form
    if (formOrder) {
        formOrder.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = formOrder.querySelector('button[type="submit"]');
            btn.disabled = true; btn.textContent = 'Procesando...';
            const orderData = {
                providerId: document.getElementById('provider-select').value,
                providerName: document.getElementById('provider-search-input').value,
                providerEmail: document.getElementById('provider-email-display').textContent,
                totalCost: document.getElementById('order-cost').value,
                deliveryDate: document.getElementById('order-date').value,
                notes: document.getElementById('order-notes').value
            };
            try {
                const pdfBase64 = await generatePurchaseOrderPDF(orderData);
                await authenticatedFetch('/.netlify/functions/procesar-orden-compra', { method: 'POST', body: JSON.stringify({ pdfBase64, orderData, selectedRequests: purchaseSelection.requests }) });
                showToast('Orden procesada'); modalOrder.classList.add('hidden'); formOrder.reset(); loadPurchasesView();
            } catch(err) { console.error(err); showToast(err.message, true); }
            finally { btn.disabled = false; btn.textContent = 'Confirmar Orden'; }
        });
    }
    
    // Provider Form
    if (formProv) {
        formProv.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = { name: document.getElementById('new-prov-name').value, contact: document.getElementById('new-prov-contact').value, email: document.getElementById('new-prov-email').value, phone: document.getElementById('new-prov-phone').value };
            try { await authenticatedFetch('/.netlify/functions/crear-proveedor', { method:'POST', body: JSON.stringify(payload)}); showToast('Proveedor creado'); modalProv.classList.add('hidden'); formProv.reset(); loadProviders(); } catch(e){ showToast(e.message, true); }
        });
    }

    // Modales triggers
    if (btnGenerateOrder) btnGenerateOrder.addEventListener('click', () => modalOrder.classList.remove('hidden'));
    if (cancelBtnOrder) cancelBtnOrder.addEventListener('click', () => { modalOrder.classList.add('hidden'); formOrder.reset(); });
    if (btnNewProv) btnNewProv.addEventListener('click', () => modalProv.classList.remove('hidden'));
    if (document.getElementById('btn-cancel-prov')) document.getElementById('btn-cancel-prov').addEventListener('click', () => modalProv.classList.add('hidden'));

    // Inicializar
    setupDashboardTabs();
    
    // Helpers para Select All checkboxes
    const selAllStock = document.getElementById('select-all-stock');
    const selAllReqs = document.getElementById('select-all-reqs');
    if(selAllStock) selAllStock.addEventListener('change', (e) => { document.querySelectorAll('.purchase-checkbox[data-type="stock"]').forEach(cb => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); }); });
    if(selAllReqs) selAllReqs.addEventListener('change', (e) => { document.querySelectorAll('.purchase-checkbox[data-type="request"]').forEach(cb => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); }); });

    // =========================================================
    // 8. GENERADOR DE RESPONSIVA (PDF + LEYENDA LEGAL)
    // =========================================================

    // Validamos que no se haya declarado antes para evitar conflictos
    const generateResponsivaPDF = async (assetData) => {
        // Carga la librería que ya usas en el proyecto
        const PDFLib = await loadPdfLib();
        if (!PDFLib) throw new Error('Error: La librería PDF no cargó correctamente.');
        const { PDFDocument, rgb, StandardFonts } = PDFLib;

        // Crear documento nuevo
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        
        // Fuentes
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontSize = 10;
        let yPos = height - 50;

        // --- 1. ENCABEZADO Y LOGO ---
        try {
            const logoBytes = await fetch('logo.png').then(res => res.arrayBuffer());
            const logoImage = await pdfDoc.embedPng(logoBytes);
            const logoDims = logoImage.scale(0.15);
            page.drawImage(logoImage, { x: 50, y: yPos - logoDims.height, width: logoDims.width, height: logoDims.height });
            yPos -= (logoDims.height + 20);
        } catch (e) {
            page.drawText('SANSCE', { x: 50, y: yPos, size: 18, font: fontBold });
            yPos -= 30;
        }

        page.drawText('Responsiva de Activo Fijo', { x: 50, y: yPos, size: 16, font: fontBold, color: rgb(0.2, 0.4, 0.6) });
        yPos -= 40;

        // --- 2. DATOS DEL ACTIVO ---
        const drawField = (label, value, y) => {
            page.drawText(label, { x: 50, y: y, size: fontSize, font: fontBold });
            const cleanValue = String(value || 'N/A').replace(/\n/g, ' '); 
            page.drawText(cleanValue, { x: 200, y: y, size: fontSize, font });
        };

        drawField('Fecha de Emisión:', new Date().toLocaleDateString(), yPos); yPos -= 20;
        drawField('ID del Activo:', assetData.assetId, yPos); yPos -= 20;
        drawField('Nombre / Modelo:', assetData.assetName, yPos); yPos -= 20;
        drawField('Responsable:', assetData.responsibleName, yPos); yPos -= 20;
        drawField('Email:', assetData.responsibleEmail, yPos); yPos -= 20;

        yPos -= 10;
        page.drawText('Condiciones de Entrega:', { x: 50, y: yPos, size: fontSize, font: fontBold });
        yPos -= 15;
        
        const conditions = assetData.conditions || 'El equipo se entrega nuevo y verificado.';
        
        // --- MODIFICACIÓN: CONTROL DE MÁRGENES ---
        // Ancho de página - 100 (50 margen izq + 50 margen der)
        // Esto asegura que el texto termine exactamente donde termina el cuadro gris
        const textWidth = width - 100; 
        
        page.drawText(conditions, { 
            x: 50, 
            y: yPos, 
            size: 9, 
            font: font, 
            color: rgb(0.3, 0.3, 0.3), 
            maxWidth: textWidth, // Esto fuerza el respeto al margen derecho
            lineHeight: 12       // Espaciado entre líneas para mejor lectura
        });
        
        // Bajamos el cursor lo suficiente para que el cuadro gris no tape el texto
        // (Estimación segura: 60 puntos, ajusta si escriben testamentos)
        yPos -= 60;

        // --- 3. CLÁUSULA DE RESPONSABILIDAD (LEYENDA LEGAL) ---
        // Dibujamos el recuadro
        page.drawRectangle({
            x: 40, y: yPos - 55, width: width - 80, height: 70,
            borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1, color: rgb(0.96, 0.96, 0.96)
        });
        
        const legalY = yPos - 10;
        
        // Título centrado ópticamente
        page.drawText('CLÁUSULA DE RESPONSABILIDAD Y CUSTODIA', { x: 50, y: legalY, size: 9, font: fontBold });
        
        // Texto ajustado manualmente para simular bloque justificado
        // Se han redistribuido las palabras para que las líneas tengan un largo similar
        const line1 = 'El resguardante asume la responsabilidad total sobre la custodia del activo descrito. Se compromete a';
        const line2 = 'cubrir los costos de reparación o reposición en caso de daño, pérdida o desperfecto derivado de';
        const line3 = 'negligencia, mal uso o falta de precaución, excluyendo el desgaste natural por el uso ordinario.';

        // x: 50 asegura un margen izquierdo alineado con el título
        page.drawText(line1, { x: 50, y: legalY - 18, size: 8, font });
        page.drawText(line2, { x: 50, y: legalY - 28, size: 8, font });
        page.drawText(line3, { x: 50, y: legalY - 38, size: 8, font });

        yPos -= 150; // Espacio para firmas

        // --- 4. ÁREA DE FIRMAS ---
        const firmY = yPos;
        
        // Definimos coordenadas de las líneas (Inicio y Fin)
        const l1Start = 50, l1End = 230;
        const l2Start = 300, l2End = 480;

        // Dibujamos las líneas
        page.drawLine({ start: { x: l1Start, y: firmY }, end: { x: l1End, y: firmY }, thickness: 1 });
        page.drawLine({ start: { x: l2Start, y: firmY }, end: { x: l2End, y: firmY }, thickness: 1 });

        // Textos
        const txtFirma1 = 'Firma del Colaborador (Recibe)';
        const txtFirma2 = 'Firma de Administración (Entrega)';
        const txtSize = 9;

        // CÁLCULO DE CENTRADO:
        // 1. Obtenemos el ancho exacto del texto usando la fuente actual
        const width1 = font.widthOfTextAtSize(txtFirma1, txtSize);
        const width2 = font.widthOfTextAtSize(txtFirma2, txtSize);

        // 2. Calculamos la posición X: (Centro de la línea) - (Mitad del texto)
        const xFirma1 = ((l1Start + l1End) / 2) - (width1 / 2);
        const xFirma2 = ((l2Start + l2End) / 2) - (width2 / 2);

        // Dibujamos los textos centrados
        page.drawText(txtFirma1, { x: xFirma1, y: firmY - 15, size: txtSize, font });
        page.drawText(txtFirma2, { x: xFirma2, y: firmY - 15, size: txtSize, font });

        // Guardar y Descargar
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Responsiva_${assetData.assetId}_${Date.now()}.pdf`;
        link.click();
    };

    // --- CONEXIÓN CON EL FORMULARIO ---
    if (newAssetForm) {
        // Importante: removemos listeners previos si existen para evitar doble envío (aunque al recargar página se limpia)
        const newAssetHandler = async (e) => {
            e.preventDefault();
            
            const submitBtn = newAssetForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            const assetSelectEl = document.getElementById('asset-select');
            const assetNameEl = document.getElementById('asset-search-input');
            const respNameEl = document.getElementById('responsible-name');
            const respEmailEl = document.getElementById('responsible-email');
            const condEl = document.getElementById('asset-conditions');

            if (!assetSelectEl.value) {
                showToast('Error: Debes seleccionar un activo válido del buscador.', true);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Procesando...';

            const assetPayload = {
                assetId: assetSelectEl.value, 
                assetName: assetNameEl.value, 
                responsibleName: respNameEl.value,
                responsibleEmail: respEmailEl.value,
                conditions: condEl.value
            };

            try {
                // 1. Guardar en Backend
                await authenticatedFetch('/.netlify/functions/generar-responsiva', {
                    method: 'POST',
                    body: JSON.stringify(assetPayload)
                });

                // 2. Generar PDF
                await generateResponsivaPDF(assetPayload);

                showToast('Responsiva guardada y descargada con éxito.');
                newAssetForm.reset();
                
            } catch (error) {
                console.error(error);
                showToast('Hubo un problema: ' + error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        };

        // Usamos onsubmit directo o addEventListener. 
        newAssetForm.onsubmit = newAssetHandler; 
    }

    // =========================================================
    // 9. REPARACIÓN DE EVENT LISTENERS FALTANTES (CATÁLOGO Y REPORTES)
    // =========================================================

    // --- A. AÑADIR NUEVO INSUMO AL CATÁLOGO ---
    if (newCatalogForm) {
        newCatalogForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = newCatalogForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            // Recolección de datos
            const payload = {
                name: document.getElementById('item-name-input').value,
                sku: document.getElementById('item-sku-input').value,
                family: document.getElementById('item-family-input').value,
                unit: document.getElementById('item-unit-input').value,
                description: document.getElementById('item-desc-input').value,
                minStock: document.getElementById('item-min-stock-input').value,
                serialNumber: document.getElementById('item-serial-input').value,
                isAsset: document.getElementById('item-is-asset-input').checked // Checkbox
            };

            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';

            try {
                // Llamada al Backend
                await authenticatedFetch('/.netlify/functions/crear-insumo', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                showToast('Insumo añadido al catálogo correctamente.');
                newCatalogForm.reset();
                
                // Recargar catálogo en memoria para que aparezca en los buscadores inmediatamente
                appState.catalog = await authenticatedFetch('/.netlify/functions/leer-catalogo', { method: 'POST' });
                populateCatalogDropdowns(); // Actualizar desplegables
                
            } catch (error) {
                console.error(error);
                showToast('Error: ' + error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // --- B. FILTRO DE INVENTARIO GENERAL ---
    const inventorySearchInput = document.getElementById('inventory-search-input');
    if (inventorySearchInput) {
        inventorySearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            
            if (!appState.fullInventory) return;

            // Filtrar sobre el inventario completo cargado en memoria
            const filtered = appState.fullInventory.filter(item => 
                (item.name && item.name.toLowerCase().includes(term)) ||
                (item.sku && item.sku.toLowerCase().includes(term)) ||
                (item.family && item.family.toLowerCase().includes(term)) ||
                (item.location && item.location.toLowerCase().includes(term))
            );

            // Actualizar la vista actual y renderizar
            appState.currentInventoryView = filtered;
            renderInventoryTable(filtered);
        });
    }

    // --- C. EXPORTAR INVENTARIO A CSV ---
    if (exportInventoryCsvBtn) {
        exportInventoryCsvBtn.addEventListener('click', async () => {
            // Asegurar que PapaParse esté cargado
            const Papa = await loadPapaParse();
            if (!Papa) {
                showToast('Error al cargar librería CSV.', true);
                return;
            }

            const dataToExport = appState.currentInventoryView || appState.fullInventory;
            if (!dataToExport || dataToExport.length === 0) {
                showToast('No hay datos para exportar.', true);
                return;
            }

            // Convertir JSON a CSV
            const csv = Papa.unparse(dataToExport);
            
            // Crear Blob y descargar
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Inventario_SANSCE_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // --- D. EXPORTAR ACTIVOS FIJOS (Backend) ---
    if (exportAssetsBtn) {
        exportAssetsBtn.addEventListener('click', async () => {
            const originalText = exportAssetsBtn.textContent;
            exportAssetsBtn.disabled = true;
            exportAssetsBtn.textContent = 'Exportando...';
            
            try {
                const res = await authenticatedFetch('/.netlify/functions/exportar-activos', { method: 'POST' });
                showToast(res.message || 'Exportación completada en Google Sheets.');
            } catch (error) {
                showToast(error.message, true);
            } finally {
                exportAssetsBtn.disabled = false;
                exportAssetsBtn.textContent = originalText;
            }
        });
    }

    // --- F. REGISTRO DE ENTRADA DE MERCANCÍA (Corrección Faltante) ---
    if (newEntryForm) {
        newEntryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = newEntryForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            // Elementos del DOM
            const itemSelect = document.getElementById('entry-item-select'); // ID Oculto
            const quantityInput = document.getElementById('entry-quantity');
            const costInput = document.getElementById('entry-cost');
            const providerInput = document.getElementById('entry-provider');
            const invoiceInput = document.getElementById('entry-invoice');
            const expirationInput = document.getElementById('entry-expiration');
            const serialInput = document.getElementById('entry-serial');

            // Validación básica
            if (!itemSelect.value) {
                showToast('Error: Debes seleccionar un insumo válido del buscador.', true);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Registrando...';

            const payload = {
                itemId: itemSelect.value,
                quantity: quantityInput.value,
                cost: costInput.value,
                provider: providerInput.value,
                invoice: invoiceInput.value,
                expirationDate: expirationInput.value, // Puede estar vacío si no aplica
                serialNumber: serialInput.value
            };

            try {
                // Llamada al Backend
                await authenticatedFetch('/.netlify/functions/registrar-entrada', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                showToast('Entrada de mercancía registrada exitosamente.');
                newEntryForm.reset();
                
                // Limpiar descripción auxiliar del buscador
                const descEl = document.getElementById('entry-item-description');
                if (descEl) descEl.textContent = 'Seleccione un insumo...';

                // Recargar inventario para reflejar el cambio en tiempo real
                if (appState.currentInventoryView) {
                    renderFullInventory(); 
                }

            } catch (error) {
                console.error(error);
                showToast('Error: ' + error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // --- E. IMPORTACIÓN MASIVA (CSV) ---
    if (bulkImportForm) {
        bulkImportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const Papa = await loadPapaParse();
            const fileInput = document.getElementById('csv-file-input');
            const file = fileInput.files[0];
            const btn = document.getElementById('bulk-import-button');
            const loader = document.getElementById('bulk-import-loader');
            const resultsDiv = document.getElementById('bulk-import-results');

            if (!file) return;

            btn.disabled = true;
            loader.classList.remove('hidden');
            resultsDiv.innerHTML = 'Procesando archivo...';

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: async function(results) {
                    const rows = results.data;
                    // Enviamos todo el bloque al backend (función bulk-import-stock que debes tener creada o crear)
                    // Nota: Si no tienes 'bulk-import-stock.js', esto fallará. 
                    // Asumiremos que procesamos uno a uno o que existe el endpoint.
                    // Para ser seguros con tu arquitectura actual, vamos a iterar aquí o enviar al endpoint si existe.
                    
                    try {
                         // Intentamos enviar al endpoint masivo
                        const response = await authenticatedFetch('/.netlify/functions/bulk-import-stock', {
                            method: 'POST',
                            body: JSON.stringify({ rows })
                        });
                        resultsDiv.innerHTML = `<p class="text-green-600">${response.message}</p>`;
                        showToast('Importación finalizada.');
                        bulkImportForm.reset();
                    } catch (err) {
                        resultsDiv.innerHTML = `<p class="text-red-600">Error: ${err.message}</p>`;
                    } finally {
                        btn.disabled = false;
                        loader.classList.add('hidden');
                    }
                }
            });
        });
    }

    bootstrapApp();
});