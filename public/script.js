document.addEventListener('DOMContentLoaded', () => {
    // --- INYECCIÓN DE CLAVE API Y EMAIL ---
    const APP_API_KEY = window.APP_API_KEY_PUBLIC;
    let userEmail = localStorage.getItem('userEmail') || null;

    // --- ESTADO DE LA APLICACIÓN ---
    let appState = {
        requests: [],
        catalog: [],
        userProfile: { role: window.USER_ROLE || null, email: userEmail }
    };

    // --- ELEMENTOS DEL DOM ---
    const searchInput = document.getElementById('search-input');
    const mainNav = document.getElementById('main-nav');
    const mainContent = document.getElementById('main-content');
    const adminNavLink = document.getElementById('admin-nav-link');
    const reportsNavLink = document.getElementById('reports-nav-link');
    const loader = document.getElementById('loader');
    const content = document.getElementById('content');
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    const newRequestForm = document.getElementById('new-request-form');
    const newEntryForm = document.getElementById('new-entry-form');
    const newCatalogForm = document.getElementById('new-catalog-item-form');
    const userTableContainer = document.getElementById('requests-table-container');
    const adminTableContainer = document.getElementById('pending-requests-container');
    const newItemSelect = document.getElementById('item-select');
    const newEntryItemSelect = document.getElementById('entry-item-select');

    // --- FUNCIÓN PARA MOSTRAR LA UI SEGÚN EL ROL ---
    const showAppForUser = (profile) => {
        if (!mainContent) return;
        mainContent.classList.remove('hidden');
        
        if(mainNav) mainNav.classList.remove('hidden');
        
    const role = profile && profile.role ? profile.role.trim().toLowerCase() : '';

// --- INICIO DE LA LÓGICA DE ROLES MEJORADA ---
    if (role === 'admin') {
        // El Admin ve todo.
        if (adminNavLink) adminNavLink.classList.remove('hidden');
        if (reportsNavLink) reportsNavLink.classList.remove('hidden');

    } else if (role === 'supervisor') {
        // ✅ El Supervisor ve Administración pero NO Reportes.
        if (adminNavLink) adminNavLink.classList.remove('hidden');
        if (reportsNavLink) reportsNavLink.classList.add('hidden');
        
    } else {
        // El resto de los usuarios no ven ninguno de los dos.
        if (adminNavLink) adminNavLink.classList.add('hidden');
        if (reportsNavLink) reportsNavLink.classList.add('hidden');
    }
    // --- FIN DE LA LÓGICA DE ROLES MEJORADA ---
};

    // --- LÓGICA DE OBTENCIÓN DE ROL (OPTIMIZADA) ---
    const fetchRole = async (email) => {
        try {
            const response = await fetch('/.netlify/functions/get-profile', {
                method: 'POST',
                headers: { 
                    'x-api-key': APP_API_KEY, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ userEmail: email })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudo verificar el usuario.');
            }

            const profile = await response.json();
            return profile.role;

        } catch (error) {
            console.error("Error al obtener el rol:", error.message);
            showToast(error.message, true);
            return null; 
        }
    };

    // --- LÓGICA DE LOGIN MANUAL ---
    const handleManualLogin = async () => {
        let email = userEmail;
        if (!email) {
            email = prompt("Por favor, introduce tu email (para la validación del rol):");
        }

        if (email) {
            email = email.trim().toLowerCase();
            userEmail = email;
            localStorage.setItem('userEmail', email);

            const role = await fetchRole(email);
            
            if (role) { // Solo si el rol es válido, continuamos
                appState.userProfile = { email: email, role: role }; 
                window.USER_ROLE = role;
                
                showAppForUser(appState.userProfile);
                await initializeApp();
            }
            
        } else {
            alert("El email es necesario para iniciar la aplicación. Recarga la página para intentarlo.");
        }
    };

    // --- LÓGICA DE INICIALIZACIÓN DE LA APP ---
    const initializeApp = async () => {
        if (loader) loader.classList.remove('hidden');
        if (content) content.classList.add('hidden');

        if (!userEmail) {
             handleManualLogin();
             return;
        }
        
        try {
            const [requestsRes, catalogRes] = await Promise.all([
                fetch('/.netlify/functions/leer-datos', { 
                    method: 'POST',
                    headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: userEmail })
                }),
                fetch('/.netlify/functions/leer-catalogo', { 
                    method: 'POST',
                    headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: userEmail })
                })
            ]);

            if (!requestsRes.ok || !catalogRes.ok) {
                const errorData = await (requestsRes.ok ? catalogRes.json() : requestsRes.json());
                throw new Error(errorData.error || 'No se pudieron cargar los datos iniciales.');
            }
            
            appState.requests = await requestsRes.json();
            appState.catalog = await catalogRes.json();
            
            renderUserRequestsTable(appState.requests);
            populateCatalogDropdowns();

            if (loader) loader.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            
            // Muestra la vista del dashboard por defecto al iniciar
            showView('dashboard-view');

        } catch (error) {
            showToast(error.message, true);
            if (loader) loader.classList.add('hidden');
        }
    };

    // 3. Finalmente, asegúrate de llamar a la nueva función para poblar el dropdown
// cuando la vista de administración se muestre. Modifica el listener de los navLinks así:

// Reemplaza el listener de navLinks con esta versión corregida

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = e.currentTarget.dataset.view;
        showView(viewId);
        if (viewId === 'admin-view') {
            renderPendingRequestsTable();
            populateAssetDropdown(); // ✅ LÍNEA AÑADIDA Y CORREGIDA
        }
        if (viewId === 'reports-view') loadReportsView();
    });
});

    // --- FUNCIONES AUXILIARES Y DE RENDERIZADO ---
    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 p-4 rounded-md text-white ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    };

// 1. Pega esta nueva función de utilidad junto a las otras funciones de renderizado
const populateAssetDropdown = () => {
    const assetSelect = document.getElementById('asset-select');
    if (!assetSelect || !appState.catalog) return;

    // Filtrar el catálogo para obtener solo los activos fijos
    // NOTA: Esta lógica asume que tu Google Sheet usa 'TRUE' para marcar un activo.
    // Si usas otro valor como 'Si', ajusta la condición.
    const assets = appState.catalog.filter(item => String(item.isAsset).toUpperCase() === 'TRUE');
    
    const defaultOption = '<option value="" disabled selected>Seleccione un activo...</option>';
    const assetOptions = assets.map(item =>
        `<option value="${item.id}">${item.name} (SKU: ${item.sku})</option>`
    ).join('');
    
    assetSelect.innerHTML = defaultOption + assetOptions;
};

    // VERSIÓN FINAL Y ROBUSTA DE showView
    const showView = (viewId) => {
        // Oculta todas las vistas
        views.forEach(view => {
            view.style.display = 'none';
        });

        // Muestra solo la vista activa
        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.style.display = 'block';
        }
        
        // Ilumina el enlace del menú correspondiente
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
        const catalogOptions = appState.catalog.map(item =>
            `<option value="${item.id}">${item.name}</option>`
        ).join('');
        newItemSelect.innerHTML = defaultOption + catalogOptions;
        newEntryItemSelect.innerHTML = defaultOption + catalogOptions;
    };

    const renderUserRequestsTable = (requestsToRender) => {
        const userView = document.getElementById('dashboard-view');
        if (!userView) return;
        
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
                        <td class="p-3">${itemName}</td>
                        <td class="p-3 text-center">${req.quantity || 'N/A'}</td>
                        <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${req.status === 'Aprobada' ? 'bg-green-100 text-green-800' : req.status === 'Rechazada' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-800'}">${req.status || 'N/A'}</span></td>
                        <td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td>
                    </tr>
                `;
            }).join('');
            contentHTML = `
                <table class="w-full text-left">
                    <thead><tr class="bg-gray-50 border-b"><th class="p-3 font-semibold text-gray-600">ID</th><th class="p-3 font-semibold text-gray-600">Insumo</th><th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th><th class="p-3 font-semibold text-gray-600">Estatus</th><th class="p-3 font-semibold text-gray-600">Fecha</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
        }
        
        userView.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-3xl font-semibold text-gray-700">Mis Solicitudes</h2>
                <div class="w-1/3">
                    <input type="search" id="search-input" placeholder="Buscar por insumo o estatus..." class="w-full p-2 border border-gray-300 rounded-md">
                </div>
            </div>
            <div id="requests-table-container" class="bg-white p-6 rounded-lg shadow-sm">${contentHTML}</div>
        `;
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

    const loadReportsView = async () => {
        const totalValueEl = document.getElementById('total-inventory-value');
        const lowStockEl = document.getElementById('low-stock-items-container');
            // Se añade el nuevo elemento del DOM
    const expiringEl = document.getElementById('expiring-items-container');
    // --- INICIO DE LA CORRECCIÓN ---
    // Se añade la verificación de 'expiringEl' para asegurar que todos los elementos existan.
    if (!totalValueEl || !lowStockEl || !expiringEl) return;
    // --- FIN DE LA CORRECCIÓN ---

        totalValueEl.textContent = 'Calculando...';
        lowStockEl.innerHTML = '<p>Calculando...</p>';
        expiringEl.innerHTML = '<p>Calculando...</p>';
        
        try {
            const response = await fetch('/.netlify/functions/generar-reporte', { 
                method: 'POST', 
                headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ userEmail: userEmail }) 
            });
            if (!response.ok) throw new Error('No se pudo generar el reporte.');
            
            const data = await response.json();
            totalValueEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(data.totalInventoryValue || 0);
            
            if (data.lowStockItems && data.lowStockItems.length > 0) {
                const itemsList = data.lowStockItems.map(item => `<div class="flex justify-between items-center p-2 border-b"><span>${item.name}</span><span class="font-bold text-red-500">${item.stock} / ${item.minStock}</span></div>`).join('');
                lowStockEl.innerHTML = itemsList;
            } else {
                lowStockEl.innerHTML = '<p class="text-gray-500">No hay insumos con stock bajo.</p>';
            }

        // --- INICIO DE LA NUEVA LÓGICA PARA CADUCIDAD ---
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
        // --- FIN DE LA NUEVA LÓGICA ---

        } catch (error) {
            showToast(error.message, true);
            totalValueEl.textContent = 'Error';
            lowStockEl.innerHTML = '<p class="text-red-500">No se pudo cargar el reporte.</p>';
            expiringEl.innerHTML = '<p class="text-red-500">No se pudo cargar el reporte.</p>';
        }
    };

    // --- EVENT LISTENERS ---
    if (newRequestForm) {
        newRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button');
            submitButton.disabled = true;
            
            const payload = {
                id: 'SOL-' + new Date().getTime(), 
                timestamp: new Date().toISOString(), 
                email: userEmail,
                item: newItemSelect.value, 
                quantity: parseInt(document.getElementById('quantity-input').value),
                userEmail: userEmail // Necesario para la validación en guardar-datos.js
            };

            try {
                const response = await fetch('/.netlify/functions/guardar-datos', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' } });
                if (!response.ok) throw new Error('Hubo un problema al guardar la solicitud.');
                showToast('Solicitud enviada con éxito.');
                newRequestForm.reset();
                await initializeApp();
                showView('dashboard-view');
            } catch (error) {
                showToast(`Error: ${error.message}`, true);
            } finally {
                submitButton.disabled = false;
            }
        });
    }
    
    if (newEntryForm) {
        newEntryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true; button.textContent = 'Registrando...';
            
                    // --- INICIO DE LA VALIDACIÓN DEL LADO DEL CLIENTE ---
        // Se añaden validaciones en el frontend para mejorar la experiencia del usuario.
        const itemId = document.getElementById('entry-item-select').value;
        const quantity = parseInt(document.getElementById('entry-quantity').value);
        const cost = parseFloat(document.getElementById('entry-cost').value);

        if (!itemId) {
            showToast('Error: Debe seleccionar un insumo.', true);
            button.disabled = false;
            button.textContent = 'Registrar Entrada';
            return; // Detiene la ejecución
        }

        if (isNaN(quantity) || quantity <= 0) {
            showToast('Error: La cantidad debe ser un número mayor a cero.', true);
            button.disabled = false;
            button.textContent = 'Registrar Entrada';
            return; // Detiene la ejecución
        }

        if (isNaN(cost) || cost < 0) {
            showToast('Error: El costo debe ser un número válido (cero o mayor).', true);
            button.disabled = false;
            button.textContent = 'Registrar Entrada';
            return; // Detiene la ejecución
        }
        // --- FIN DE LA VALIDACIÓN DEL LADO DEL CLIENTE ---

            const payload = {
            itemId: itemId, 
            quantity: quantity,
            cost: cost, 
            provider: document.getElementById('entry-provider').value,
            invoice: document.getElementById('entry-invoice').value, 
            expirationDate: document.getElementById('entry-expiration').value,
            serialNumber: document.getElementById('entry-serial').value,
            userEmail: userEmail
        };

            try {
                const response = await fetch('/.netlify/functions/registrar-entrada', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' } });
                if (!response.ok){
                // Ahora, si el backend aún da un error, podemos mostrar un mensaje más específico. 
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Falló el registro.');
                }
                
                showToast('Entrada registrada con éxito.');
                newEntryForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false; button.textContent = 'Registrar Entrada';
            }
        });
    }

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
                serialNumber: document.getElementById('item-serial-input').value,
                // ✅ LÍNEA AÑADIDA: Lee si la casilla está marcada (devuelve true o false)
                isAsset: document.getElementById('item-is-asset-input').checked,
                userEmail: userEmail
            };

            try {
                const response = await fetch('/.netlify/functions/crear-insumo', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' } });
                if (!response.ok) throw new Error('No se pudo crear el insumo.');
                showToast('Insumo añadido al catálogo con éxito.');
                newCatalogForm.reset();
                await initializeApp(); 
            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false; button.textContent = 'Añadir al Catálogo';
            }
        });
    }

        // En script.js, dentro del DOMContentLoaded, junto a los otros listeners

// --- INICIO DEL NUEVO LISTENER PARA EXPORTAR ---
const exportAssetsBtn = document.getElementById('export-assets-btn');
if (exportAssetsBtn) {
    exportAssetsBtn.addEventListener('click', async () => {
        const button = exportAssetsBtn;
        button.disabled = true;
        button.textContent = 'Exportando...';

        try {
            const response = await fetch('/.netlify/functions/exportar-activos', {
                method: 'POST',
                headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ userEmail: userEmail })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falló la exportación.');
            }
            
            const result = await response.json();
            showToast(result.message);

        } catch (error) {
            showToast(error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = 'Exportar Activos';
        }
    });
}
// --- FIN DEL NUEVO LISTENER ---

// 2. Pega este nuevo event listener junto a los otros listeners de formularios
const newAssetForm = document.getElementById('new-asset-assignment-form');
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
            conditions: document.getElementById('asset-conditions').value,
            userEmail: userEmail // Email del supervisor que está logueado
        };

        if (!payload.assetId || !payload.responsibleName || !payload.responsibleEmail) {
            showToast('Por favor, complete todos los campos obligatorios (*).', true);
            button.disabled = false;
            button.textContent = 'Generar Responsiva';
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/generar-responsiva', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudo generar la responsiva.');
            }

            showToast('Responsiva generada con éxito.');
            newAssetForm.reset();
            await initializeApp(); // Recargar datos para reflejar la salida del stock

        } catch (error) {
            showToast(error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = 'Generar Responsiva';
        }
    });
}


    if (adminTableContainer) {
        adminTableContainer.addEventListener('click', async (e) => {
            if (e.target.classList.contains('action-btn')) {
                const button = e.target;
                button.disabled = true; button.textContent = '...';
                const { id, action } = button.dataset;
                try {
                    const response = await fetch('/.netlify/functions/actualizar-solicitud', {
                        method: 'POST', 
                        body: JSON.stringify({ 
                            requestId: id, 
                            action: action, 
                            approverEmail: userEmail 
                        }),
                        headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' }
                    });
                    if (!response.ok) throw new Error('Falló la actualización.');
                    showToast(`Solicitud ${action.toLowerCase()}.`);
                    await initializeApp();
                    renderPendingRequestsTable();
                } catch (error) {
                    showToast(error.message, true);
                    button.disabled = false; button.textContent = action;
                }
            }
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.dataset.view;
            showView(viewId);
            if (viewId === 'admin-view') renderPendingRequestsTable();
            if (viewId === 'reports-view') loadReportsView();
        });
    });

    // Re-asigna el listener al input de búsqueda después de renderizar la tabla
    document.body.addEventListener('input', (e) => {
        if (e.target.id === 'search-input') {
            const searchTerm = e.target.value.toLowerCase();
            const userRequests = appState.requests;
            const filteredRequests = userRequests.filter(req => {
                const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
                const itemName = catalogItem ? catalogItem.name.toLowerCase() : '';
                return itemName.includes(searchTerm) || req.status.toLowerCase().includes(searchTerm);
            });
            renderUserRequestsTable(filteredRequests);
        }
    });

    // --- LLAMADA INICIAL DE LA APLICACIÓN ---
    handleManualLogin();

});

