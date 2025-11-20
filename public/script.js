document.addEventListener('DOMContentLoaded', () => {
    
    // --- NUEVO SISTEMA DE AUTENTICACIÓN Y ESTADO ---
    let appState = {
        requests: [],
        catalog: [],
        fullInventory: [],
        currentInventoryView: [],
        providers: [],
        userProfile: null, 
        pdfLib: null,
        papaParse: null
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
    
    // Formularios
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

    const exportInventoryCsvBtn = document.getElementById('export-inventory-csv-btn');
    const bulkImportForm = document.getElementById('bulk-import-form');

    // Elementos del Módulo de Compras
    const purchasesNavElement = document.getElementById('purchases-nav-link');
    const btnGenerateOrder = document.getElementById('btn-generate-order');
    const purchaseCountSpan = document.getElementById('purchase-count');
    const btnNewProv = document.getElementById('btn-new-provider');
    const modalProv = document.getElementById('new-provider-modal');
    const formProv = document.getElementById('new-provider-form');


    // --- 1. FUNCIONES DE RED (FETCH) ---

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

    // --- 2. LÓGICA DE SESIÓN ---

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

            if (!response.ok) {
                throw new Error(data.error || 'Error desconocido del servidor');
            }
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

    // --- 3. LÓGICA DE LA APLICACIÓN ---

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
            
            renderUserRequestsTable(appState.requests);
            populateCatalogDropdowns();

            if (loader) loader.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            
            showView('dashboard-view');

        } catch (error) {
            showToast(error.message, true);
            if (loader) loader.classList.add('hidden');
            handleLogout();
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
        const purchasesNavLink = document.getElementById('purchases-nav-link');

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

    // --- 4. HELPERS DE UI Y CARGA DIFERIDA ---

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

    const loadReportsView = async () => {
        const totalValueEl = document.getElementById('total-inventory-value');
        const lowStockEl = document.getElementById('low-stock-items-container');
        const expiringEl = document.getElementById('expiring-items-container');
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
        } catch (error) {
            console.error("Error al cargar pdf-lib:", error);
            showToast("No se pudo cargar la librería PDF.", true);
            return null;
        }
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
        } catch (error) {
            console.error("Error al cargar PapaParse:", error);
            showToast("No se pudo cargar la librería de importación.", true);
            return null;
        }
    };

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
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        return params.get('token');
    };

    const saveSessionToStorage = (session) => {
        localStorage.setItem('userSession', JSON.stringify(session));
    };

    const getSessionFromStorage = () => {
        const sessionStr = localStorage.getItem('userSession');
        try { return JSON.parse(sessionStr); } catch (e) { return null; }
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
        const PDFLib = await loadPdfLib();
        if (!PDFLib) return;
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 12;

        try {
            const logoUrl = 'logo.png';
            const logoImageBytes = await fetch(logoUrl).then(res => res.arrayBuffer());
            const logoImage = await pdfDoc.embedPng(logoImageBytes);
            const logoDims = logoImage.scale(0.15);
            page.drawImage(logoImage, { x: 50, y: height - logoDims.height - 50, width: logoDims.width, height: logoDims.height });
        } catch (err) { console.warn("No se pudo cargar el logo.png para el PDF."); }

        const title = 'Responsiva de Activo Fijo';
        const titleSize = 18;
        const titleWidth = font.widthOfTextAtSize(title, titleSize);
        page.drawText('Responsiva de Activo Fijo', { x: (width - titleWidth) / 2, y: height - 180, font, size: titleSize, color: rgb(0, 0, 0) });

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
            page.drawText(line, { x: 50, y: textY - (i * 20), font, size: fontSize, color: rgb(0.2, 0.2, 0.2) });
        });

        const signatureY = 150;
        page.drawText('_________________________', { x: 50, y: signatureY, font, size: fontSize });
        page.drawText('Firma del Colaborador', { x: 70, y: signatureY - 15, font, size: 10 });
        page.drawText('_________________________', { x: width - 200, y: signatureY, font, size: fontSize });
        page.drawText('Firma de Quien Entrega', { x: width - 180, y: signatureY - 15, font, size: 10 });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Responsiva_${payload.assetId}.pdf`;
        link.click();
    };

    const downloadCSV = (csvString, filename) => {
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) { 
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
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
                <td class="p-3">${item.location || ''}</td>
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
                        <th class="p-3 font-semibold text-gray-600">Ubicación</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
    };

    const populateAssetDropdown = () => {
        if (!appState.catalog) return;
        const assets = appState.catalog.filter(item => String(item.isAsset).toUpperCase() === 'TRUE');
        const assetData = assets.map(item => ({
            id: item.id,
            label: item.name,
            details: `SKU: ${item.sku} | Serie: ${item.serialNumber || 'S/N'}`
        }));
        setupSearchableDropdown('asset-search-input', 'asset-select', 'asset-search-results', assetData);
    };

    const showView = (viewId) => {
        views.forEach(view => view.style.display = 'none');
        const activeView = document.getElementById(viewId);
        if (activeView) activeView.style.display = 'block';
        
        navLinks.forEach(link => {
            const parentLi = link.closest('li');
            if (parentLi) parentLi.classList.toggle('bg-gray-200', link.dataset.view === viewId);
        });
    };

    const populateCatalogDropdowns = () => {
        if (!appState.catalog) return;
        const consumableItems = appState.catalog.filter(item => String(item.isAsset).toUpperCase() !== 'TRUE');
        const consumableData = consumableItems.map(item => ({ id: item.id, label: item.name, details: `SKU: ${item.sku}` }));
        setupSearchableDropdown('item-search-input', 'item-select', 'item-search-results', consumableData);

        const allItemsData = appState.catalog.map(item => ({ id: item.id, label: item.name, details: `SKU: ${item.sku}` }));
        setupSearchableDropdown('entry-search-input', 'entry-item-select', 'entry-search-results', allItemsData, (selectedItem) => {
            const descriptionEl = document.getElementById('entry-item-description');
            const fullItem = appState.catalog.find(i => i.id === selectedItem.id);
            if (descriptionEl) descriptionEl.textContent = fullItem.description || "(Sin descripción)";
        });
    };

    const renderUserRequestsTable = (requestsToRender) => {
        const containerPending = document.getElementById('requests-pending-container');
        const containerApproved = document.getElementById('requests-approved-container');
        const containerRejected = document.getElementById('requests-rejected-container');
        
        if (!containerPending) {
            // Fallback para HTML viejo
            const oldContainer = document.getElementById('requests-table-container');
            if(oldContainer) oldContainer.innerHTML = '<p class="text-red-500">Actualiza el HTML del Dashboard.</p>';
            return;
        }

        if (!requestsToRender || requestsToRender.length === 0) {
            containerPending.innerHTML = '<p class="text-gray-500 p-4">No tienes solicitudes.</p>';
            containerApproved.innerHTML = '<p class="text-gray-500 p-4">No tienes solicitudes.</p>';
            containerRejected.innerHTML = '<p class="text-gray-500 p-4">No tienes solicitudes.</p>';
            return;
        }

        const pending = requestsToRender.filter(r => r.status === 'Pendiente');
        const approved = requestsToRender.filter(r => r.status === 'Aprobada');
        const rejected = requestsToRender.filter(r => r.status === 'Rechazada');

        const countBadge = document.getElementById('count-pending');
        if (countBadge) countBadge.textContent = pending.length;

        const generateTableHTML = (requests, emptyMessage) => {
            if (requests.length === 0) return `<p class="text-gray-500 italic p-4">${emptyMessage}</p>`;
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

    // --- 5. MÓDULO DE COMPRAS Y PROVEEDORES ---

    let purchaseSelection = { stock: [], requests: [] };
    let purchaseDataCache = null;

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
            
            const providerData = providers.map(p => ({
                id: p.id,
                label: p.name,
                details: p.contact ? `Contacto: ${p.contact}` : '',
                originalData: p 
            }));

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

        } catch (error) {
            console.error("Error cargando proveedores", error);
        }
    };

    const renderPurchaseLists = (data) => {
        const stockListEl = document.getElementById('purchase-stock-list');
        const reqListEl = document.getElementById('purchase-requests-list');
        
        purchaseSelection = { stock: [], requests: [] };
        updatePurchaseUI();

        if (data.lowStockItems.length === 0) {
            stockListEl.innerHTML = '<p class="text-gray-500 text-sm p-2">Todo el stock está saludable.</p>';
        } else {
            stockListEl.innerHTML = data.lowStockItems.map((item, index) => `
                <div class="flex items-start p-3 border-b bg-white hover:bg-red-50 transition">
                    <input type="checkbox" class="mt-1 mr-3 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500 purchase-checkbox" data-type="stock" data-index="${index}">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800">${item.name}</p>
                        <div class="flex justify-between text-xs text-gray-600 mt-1">
                            <span>Stock: <strong class="text-red-600">${item.currentStock}</strong> / Min: ${item.minStock}</span>
                            <span class="bg-red-100 text-red-800 px-2 py-0.5 rounded">Sugerido: +${item.suggestedQty} ${item.unit || ''}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        if (data.purchaseRequests.length === 0) {
            reqListEl.innerHTML = '<p class="text-gray-500 text-sm p-2">No hay solicitudes pendientes.</p>';
        } else {
            reqListEl.innerHTML = data.purchaseRequests.map((req, index) => `
                <div class="flex items-start p-3 border-b bg-white hover:bg-blue-50 transition">
                    <input type="checkbox" class="mt-1 mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 purchase-checkbox" data-type="request" data-index="${index}">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800">${req.name}</p>
                        <p class="text-xs text-gray-500">Por: ${req.requester}</p>
                        <div class="mt-1 text-xs bg-gray-100 p-1 rounded">
                            <span class="font-bold">Cant: ${req.quantity}</span> - ${req.justification || 'Sin justificación'}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        document.querySelectorAll('.purchase-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const type = e.target.dataset.type;
                const index = e.target.dataset.index;
                const item = type === 'stock' ? purchaseDataCache.lowStockItems[index] : purchaseDataCache.purchaseRequests[index];

                if (e.target.checked) {
                    if (type === 'stock') purchaseSelection.stock.push(item); else purchaseSelection.requests.push(item);
                } else {
                    if (type === 'stock') purchaseSelection.stock = purchaseSelection.stock.filter(i => i.id !== item.id);
                    else purchaseSelection.requests = purchaseSelection.requests.filter(i => i.id !== item.id);
                }
                updatePurchaseUI();
            });
        });
    };

    const updatePurchaseUI = () => {
        const total = purchaseSelection.stock.length + purchaseSelection.requests.length;
        if (purchaseCountSpan) purchaseCountSpan.textContent = total;
        if (btnGenerateOrder) btnGenerateOrder.disabled = total === 0;
    };

    const setupSelectAllListeners = () => {
        const selectAllStock = document.getElementById('select-all-stock');
        const selectAllReqs = document.getElementById('select-all-reqs');

        if (selectAllStock) {
            selectAllStock.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.purchase-checkbox[data-type="stock"]');
                checkboxes.forEach(cb => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); });
            });
        }
        if (selectAllReqs) {
            selectAllReqs.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.purchase-checkbox[data-type="request"]');
                checkboxes.forEach(cb => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); });
            });
        }
    };

    const generatePurchaseOrderPDF = async (orderData) => {
        const PDFLib = await loadPdfLib();
        if (!PDFLib) throw new Error('No se pudo cargar PDF-Lib');
        
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        let yPos = height - 50;
        page.drawText('ORDEN DE COMPRA', { x: 50, y: yPos, size: 20, font: fontBold });
        yPos -= 30;
        page.drawText(`Fecha: ${new Date().toLocaleDateString()}`, { x: 50, y: yPos, size: 12, font });
        page.drawText(`Proveedor: ${orderData.providerName}`, { x: 300, y: yPos, size: 12, font });
        yPos -= 20;
        page.drawText(`Entrega Estimada: ${orderData.deliveryDate}`, { x: 50, y: yPos, size: 12, font });
        if (orderData.notes) { yPos -= 20; page.drawText(`Notas: ${orderData.notes}`, { x: 50, y: yPos, size: 10, font, color: rgb(0.4, 0.4, 0.4) }); }
        yPos -= 40;
        page.drawText('CANT', { x: 50, y: yPos, size: 10, font: fontBold });
        page.drawText('DESCRIPCIÓN / PRODUCTO', { x: 100, y: yPos, size: 10, font: fontBold });
        page.drawText('TIPO', { x: 450, y: yPos, size: 10, font: fontBold });
        yPos -= 5;
        page.drawLine({ start: { x: 50, y: yPos }, end: { x: 550, y: yPos }, thickness: 1, color: rgb(0, 0, 0) });
        yPos -= 20;

        purchaseSelection.stock.forEach(item => {
            if (yPos < 50) { page = pdfDoc.addPage(); yPos = height - 50; }
            page.drawText(`${item.suggestedQty}`, { x: 50, y: yPos, size: 10, font });
            page.drawText(`${item.name} (SKU: ${item.sku})`, { x: 100, y: yPos, size: 10, font });
            page.drawText(`Reposición`, { x: 450, y: yPos, size: 9, font, color: rgb(0.6, 0, 0) });
            yPos -= 20;
        });

        purchaseSelection.requests.forEach(item => {
            if (yPos < 50) { page = pdfDoc.addPage(); yPos = height - 50; }
            page.drawText(`${item.quantity}`, { x: 50, y: yPos, size: 10, font });
            page.drawText(`${item.name}`, { x: 100, y: yPos, size: 10, font });
            page.drawText(`Ref: ${item.justification || ''}`, { x: 100, y: yPos - 10, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
            page.drawText(`Solicitud`, { x: 450, y: yPos, size: 9, font, color: rgb(0, 0, 0.6) });
            yPos -= 30;
        });

        yPos -= 50;
        if (yPos < 100) { page = pdfDoc.addPage(); yPos = height - 150; }
        page.drawLine({ start: { x: 50, y: yPos }, end: { x: 200, y: yPos }, thickness: 1 });
        page.drawText('Autorizado por', { x: 80, y: yPos - 15, size: 10, font });
        page.drawText(appState.userProfile.email, { x: 50, y: yPos - 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

        const pdfBytes = await pdfDoc.saveAsBase64({ dataUri: false });
        return pdfBytes;
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

    // --- EVENT LISTENERS GLOBALES ---
    
    // Listeners de Navegación
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

    // Listener para login
    if (loginForm) loginForm.addEventListener('submit', handleLoginRequest);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    // Listener búsqueda
    document.body.addEventListener('input', (e) => {
        if (e.target.id === 'inventory-search-input') {
            const searchTerm = e.target.value.toLowerCase();
            const filteredInventory = (appState.fullInventory || []).filter(item =>
                item.name.toLowerCase().includes(searchTerm) || item.sku.toLowerCase().includes(searchTerm) || item.family.toLowerCase().includes(searchTerm)
            );
            appState.currentInventoryView = filteredInventory;
            renderInventoryTable(appState.currentInventoryView);
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

    // Listeners de Compras
    if (btnGenerateOrder) btnGenerateOrder.addEventListener('click', () => modal.classList.remove('hidden'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.classList.add('hidden'); form.reset(); });
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true; submitBtn.textContent = 'Procesando...';
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
                await authenticatedFetch('/.netlify/functions/procesar-orden-compra', {
                    method: 'POST',
                    body: JSON.stringify({ pdfBase64, orderData, selectedRequests: purchaseSelection.requests })
                });
                showToast('Orden generada.');
                modal.classList.add('hidden'); form.reset(); loadPurchasesView();
            } catch (error) { console.error(error); showToast(error.message, true); } 
            finally { submitBtn.disabled = false; submitBtn.textContent = 'Confirmar Orden'; }
        });
    }

    if(btnNewProv) {
        btnNewProv.addEventListener('click', () => modalProv.classList.remove('hidden'));
        document.getElementById('btn-cancel-prov').addEventListener('click', () => modalProv.classList.add('hidden'));
        formProv.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                name: document.getElementById('new-prov-name').value,
                contact: document.getElementById('new-prov-contact').value,
                email: document.getElementById('new-prov-email').value,
                phone: document.getElementById('new-prov-phone').value
            };
            try {
                await authenticatedFetch('/.netlify/functions/crear-proveedor', { method: 'POST', body: JSON.stringify(payload) });
                showToast('Proveedor registrado'); modalProv.classList.add('hidden'); formProv.reset(); loadProviders();
            } catch (error) { showToast(error.message, true); }
        });
    }

    // Inicializar componentes finales
    setupSelectAllListeners();
    setupDashboardTabs();
    bootstrapApp();

});