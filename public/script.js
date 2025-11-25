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

    const generatePurchaseOrderPDF = async (orderData) => {
        const PDFLib = await loadPdfLib();
        if (!PDFLib) throw new Error('PDF-Lib no cargado');
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        let yPos = height - 40; 

        // --- 1. LOGO (Esquina Superior Izquierda) ---
        try {
            const logoUrl = 'logo.png'; 
            const logoImageBytes = await fetch(logoUrl).then((res) => res.arrayBuffer());
            const logoImage = await pdfDoc.embedPng(logoImageBytes); 
            const logoDims = logoImage.scale(0.15); 

            page.drawImage(logoImage, {
                x: 50,
                y: yPos - logoDims.height, 
                width: logoDims.width,
                height: logoDims.height,
            });

            yPos -= (logoDims.height + 20); 

        } catch (error) {
            console.warn("No se pudo cargar el logo.", error);
            yPos -= 60; 
        }

        // --- 2. TÍTULO (Centrado en la página) ---
        yPos -= 30; 

        const titleText = 'Requisición de materiales';
        const titleSize = 18;
        const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
        const titleX = (width - titleWidth) / 2; // Cálculo para centrar horizontalmente

        page.drawText(titleText, { 
            x: titleX, 
            y: yPos, 
            size: titleSize, 
            font: fontBold 
        });
        
        yPos -= 40; 
        
        // Datos de cabecera
        page.drawText(`Fecha: ${new Date().toLocaleDateString()}`, { x: 50, y: yPos, size: 11, font });
        page.drawText(`Proveedor: ${orderData.providerName || 'N/A'}`, { x: 300, y: yPos, size: 11, font });
        
        yPos -= 18;
        page.drawText(`Entrega Estimada: ${orderData.deliveryDate || 'Pendiente'}`, { x: 50, y: yPos, size: 11, font });
        
        if (orderData.notes) { 
            yPos -= 18; 
            page.drawText(`Notas: ${orderData.notes}`, { x: 50, y: yPos, size: 10, font, color: rgb(0.3, 0.3, 0.3) }); 
        }
        
        // --- 3. TABLA DE ITEMS ---
        yPos -= 30;

        page.drawText('CANT', { x: 50, y: yPos, size: 9, font: fontBold });
        page.drawText('DESCRIPCIÓN', { x: 100, y: yPos, size: 9, font: fontBold });
        page.drawText('TIPO', { x: 450, y: yPos, size: 9, font: fontBold });
        
        yPos -= 5;
        page.drawLine({ start: { x: 50, y: yPos }, end: { x: 550, y: yPos }, thickness: 1, color: rgb(0,0,0) });
        yPos -= 20;

        const itemsToPrint = [...purchaseSelection.stock, ...purchaseSelection.requests];

        if (itemsToPrint.length === 0) {
            const noItemsText = '--- No se seleccionaron productos para esta orden ---';
            const noItemsWidth = font.widthOfTextAtSize(noItemsText, 10);
            page.drawText(noItemsText, { 
                x: (width - noItemsWidth) / 2, // También centramos este aviso
                y: yPos, 
                size: 10, font, color: rgb(0.6, 0, 0) 
            });
            yPos -= 20;
        } else {
            itemsToPrint.forEach(item => {
                if (yPos < 80) { page = pdfDoc.addPage(); yPos = height - 50; }
                
                const qty = item.suggestedQty || item.quantity || '1';
                const type = item.suggestedQty ? 'Reposición' : 'Solicitud';
                const itemName = item.name || 'Sin nombre';

                page.drawText(`${qty}`, { x: 50, y: yPos, size: 10, font });
                
                const cleanName = itemName.length > 60 ? itemName.substring(0, 60) + '...' : itemName;
                page.drawText(`${cleanName}`, { x: 100, y: yPos, size: 10, font });
                
                page.drawText(`${type}`, { x: 450, y: yPos, size: 9, font });
                page.drawLine({ start: { x: 50, y: yPos - 5 }, end: { x: 550, y: yPos - 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
                
                yPos -= 20;
            });
        }

        // --- 4. FIRMAS Y PIE DE PÁGINA (CENTRADO EN LA PÁGINA) ---
        
        if (yPos < 100) { page = pdfDoc.addPage(); yPos = height - 100; } else { yPos -= 60; }

        // Cálculos para centrar el bloque de firma en la página
        const lineWidth = 200; // Longitud de la línea
        const centerPageX = width / 2; // Centro exacto de la página
        const lineStart = centerPageX - (lineWidth / 2); // Dónde empieza la línea
        const lineEnd = centerPageX + (lineWidth / 2);   // Dónde termina la línea

        // Dibujamos la línea centrada
        page.drawLine({ start: { x: lineStart, y: yPos }, end: { x: lineEnd, y: yPos }, thickness: 1 });

        // Texto "Autorizado por:"
        const authLabel = 'Autorizado por:';
        const authLabelWidth = fontBold.widthOfTextAtSize(authLabel, 9);
        page.drawText(authLabel, { 
            x: centerPageX - (authLabelWidth / 2), // Centrado sobre el eje
            y: yPos - 15, 
            size: 9, 
            font: fontBold 
        });

        // Texto Email
        const emailText = appState.userProfile.email || 'Admin';
        const emailWidth = font.widthOfTextAtSize(emailText, 9);
        page.drawText(emailText, { 
            x: centerPageX - (emailWidth / 2), // Centrado sobre el eje
            y: yPos - 28, 
            size: 9, 
            font: font, 
            color: rgb(0.3, 0.3, 0.3) 
        });

        // Código del documento (Esquina Inferior Derecha)
        const pages = pdfDoc.getPages();
        pages.forEach(p => {
             const { width: pWidth } = p.getSize();
             p.drawText('GEM-FR-06', { x: pWidth - 100, y: 30, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
        });

        return await pdfDoc.saveAsBase64({ dataUri: false });
    };


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
    // NUEVO CÓDIGO: GENERADOR DE RESPONSIVA CON LEYENDA LEGAL
    // =========================================================

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
            // Intenta cargar logo.png si está disponible en la raíz
            const logoBytes = await fetch('logo.png').then(res => res.arrayBuffer());
            const logoImage = await pdfDoc.embedPng(logoBytes);
            const logoDims = logoImage.scale(0.15);
            page.drawImage(logoImage, { x: 50, y: yPos - logoDims.height, width: logoDims.width, height: logoDims.height });
            yPos -= (logoDims.height + 20);
        } catch (e) {
            // Fallback si no hay imagen
            page.drawText('SANSCE', { x: 50, y: yPos, size: 18, font: fontBold });
            yPos -= 30;
        }

        page.drawText('Responsiva de Activo Fijo', { x: 50, y: yPos, size: 16, font: fontBold, color: rgb(0.2, 0.4, 0.6) });
        yPos -= 40;

        // --- 2. DATOS DEL ACTIVO ---
        const drawField = (label, value, y) => {
            page.drawText(label, { x: 50, y: y, size: fontSize, font: fontBold });
            // Limpieza básica de texto para evitar errores en PDF
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
        page.drawText(conditions, { x: 50, y: yPos, size: 9, font, color: rgb(0.3, 0.3, 0.3), maxWidth: 500 });
        
        yPos -= 60;

        // --- 3. NUEVA LEYENDA LEGAL (CLÁUSULA DE RESPONSABILIDAD) ---
        // Dibujamos un recuadro gris claro para resaltar la importancia
        page.drawRectangle({
            x: 40, y: yPos - 55, width: width - 80, height: 70,
            borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1, color: rgb(0.96, 0.96, 0.96)
        });
        
        const legalY = yPos - 10;
        page.drawText('CLÁUSULA DE RESPONSABILIDAD Y CUSTODIA', { x: 50, y: legalY, size: 9, font: fontBold });
        
        // Texto dividido en líneas manualmente para asegurar que cabe
        const line1 = 'El resguardante asume la responsabilidad total sobre la custodia del activo descrito. Se compromete a';
        const line2 = 'cubrir los costos de reparación o reposición en caso de daño, pérdida o desperfecto derivado de';
        const line3 = 'negligencia, mal uso o falta de precaución, excluyendo el desgaste natural por el uso ordinario.';

        page.drawText(line1, { x: 50, y: legalY - 15, size: 8, font });
        page.drawText(line2, { x: 50, y: legalY - 25, size: 8, font });
        page.drawText(line3, { x: 50, y: legalY - 35, size: 8, font });

        yPos -= 150; // Espacio para firmar

        // --- 4. ÁREA DE FIRMAS ---
        const firmY = yPos;
        // Línea izquierda
        page.drawLine({ start: { x: 50, y: firmY }, end: { x: 230, y: firmY }, thickness: 1 });
        // Línea derecha
        page.drawLine({ start: { x: 300, y: firmY }, end: { x: 480, y: firmY }, thickness: 1 });

        page.drawText('Firma del Colaborador (Recibe)', { x: 50, y: firmY - 15, size: 9, font });
        page.drawText('Firma de Administración (Entrega)', { x: 300, y: firmY - 15, size: 9, font });

        // Guardar y Descargar automáticamente
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Responsiva_${assetData.assetId}_${Date.now()}.pdf`;
        link.click();
    };

    // --- CONEXIÓN CON EL FORMULARIO ---
    // Usamos la variable 'newAssetForm' que ya declaraste al inicio de script.js
    if (newAssetForm) {
        newAssetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Elementos del DOM
            const submitBtn = newAssetForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            // Recolección de datos
            const assetSelectEl = document.getElementById('asset-select');
            const assetNameEl = document.getElementById('asset-search-input');
            const respNameEl = document.getElementById('responsible-name');
            const respEmailEl = document.getElementById('responsible-email');
            const condEl = document.getElementById('asset-conditions');

            if (!assetSelectEl.value) {
                showToast('Error: Debes seleccionar un activo válido del buscador.', true);
                return;
            }

            // Bloquear botón
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
                // 1. Backend: Guardar registro en Google Sheets
                // Usa tu función existente 'generar-responsiva.js'
                await authenticatedFetch('/.netlify/functions/generar-responsiva', {
                    method: 'POST',
                    body: JSON.stringify(assetPayload)
                });

                // 2. Frontend: Generar y descargar PDF
                await generateResponsivaPDF(assetPayload);

                showToast('Responsiva guardada y descargada con éxito.');
                newAssetForm.reset();
                
            } catch (error) {
                console.error(error);
                showToast('Hubo un problema: ' + error.message, true);
            } finally {
                // Restaurar botón
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    bootstrapApp();
});