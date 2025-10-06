document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DE LA APLICACIÓN ---
    let appState = {
        requests: [],
        catalog: []
    };

    // --- ELEMENTOS DEL DOM (SECCIÓN COMPLETA Y VALIDADA) ---
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

    const initializeApp = async () => {
        if (loader) loader.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        try {
            const user = netlifyIdentity.currentUser();
            if (!user) return;

            const [requestsRes, catalogRes] = await Promise.all([
                fetch('/.netlify/functions/leer-datos', { headers: { Authorization: `Bearer ${user.token.access_token}` } }),
                fetch('/.netlify/functions/leer-catalogo', { headers: { Authorization: `Bearer ${user.token.access_token}` } })
            ]);
            if (!requestsRes.ok || !catalogRes.ok) throw new Error('No se pudieron cargar los datos iniciales.');
            appState.requests = await requestsRes.json();
            appState.catalog = await catalogRes.json();
            
            const userRequests = appState.requests.filter(req => req.email === user.email);
            renderUserRequestsTable(userRequests);
            
            populateCatalogDropdowns();
            if (loader) loader.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            showView('dashboard-view');
        } catch (error) {
            showToast(error.message, true);
        }
    };

    // --- LÓGICA DE AUTENTICACIÓN (VERSIÓN CORREGIDA) ---
    const showAppForUser = (user) => {
        if (!mainNav || !mainContent) return;
        mainNav.classList.remove('hidden');
        mainContent.classList.remove('hidden');
        const roles = user?.app_metadata?.roles || [];
        if (roles.includes('admin') && adminNavLink && reportsNavLink) {
            adminNavLink.classList.remove('hidden');
            reportsNavLink.classList.remove('hidden');
        }
    };

    if (window.netlifyIdentity) {
        // 1. Escuchar futuros inicios de sesión
        netlifyIdentity.on('login', (user) => {
            showAppForUser(user);
            initializeApp();
            netlifyIdentity.close();
        });

        // 2. Escuchar futuros cierres de sesión
        netlifyIdentity.on('logout', () => {
            // Oculta la app y recarga para limpiar el estado
            if (mainNav) mainNav.classList.add('hidden');
            if (mainContent) mainContent.classList.add('hidden');
            window.location.reload();
        });

        // 3. Verificar inmediatamente el usuario actual (ESTA ES LA CLAVE)
        const currentUser = netlifyIdentity.currentUser();
        if (currentUser) {
            // Si ya hay un usuario, muestra la app sin esperar ningún evento
            showAppForUser(currentUser);
            initializeApp();
        }
    }

    // --- FUNCIONES ---
    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 p-4 rounded-md text-white ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    };

    const showView = (viewId) => {
        if (!views || !navLinks) return;
        views.forEach(view => view.classList.add('hidden'));
        const activeView = document.getElementById(viewId);
        if (activeView) activeView.classList.remove('hidden');
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.view === viewId);
        });
    };

// VERSIÓN CORREGIDA para script.js

const populateCatalogDropdowns = () => {
    // Verifica que los elementos <select> y el catálogo existan para evitar errores.
    if (!newItemSelect || !newEntryItemSelect || !appState.catalog) {
        console.error("Elementos del dropdown o catálogo no encontrados.");
        return;
    }

    // Crea una opción por defecto para guiar al usuario.
    const defaultOption = '<option value="" disabled selected>Seleccione un insumo...</option>';

    // Genera el HTML para todas las opciones del catálogo.
    // Usamos el 'name' para el texto visible y el 'id' como el valor interno.
    const catalogOptions = appState.catalog.map(item =>
        `<option value="${item.id}">${item.name}</option>`
    ).join('');

    // Asigna las opciones a ambos menús desplegables.
    newItemSelect.innerHTML = defaultOption + catalogOptions;
    newEntryItemSelect.innerHTML = defaultOption + catalogOptions;
};

// VERSIÓN CORREGIDA para script.js

// VERSIÓN CORREGIDA para script.js

const renderUserRequestsTable = (requestsToRender) => {
    if (!userTableContainer) return;

    if (!requestsToRender || requestsToRender.length === 0) {
        userTableContainer.innerHTML = '<p class="text-gray-500">No tienes solicitudes por el momento.</p>';
        return;
    }

    const tableRows = requestsToRender.map(req => {
        // --- INICIO DE LA LÓGICA AÑADIDA ---
        // Busca en el catálogo el insumo que coincida con el ID guardado en la solicitud (req.item)
        const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
        
        // Si se encuentra, usa su nombre. Si no, muestra el ID como respaldo.
        const itemName = catalogItem ? catalogItem.name : (req.item || 'Desconocido');
        // --- FIN DE LA LÓGICA AÑADIDA ---

        return `
            <tr class="border-b">
                <td class="p-3">${req.id || 'N/A'}</td>
                <td class="p-3">${itemName}</td>  <td class="p-3 text-center">${req.quantity || 'N/A'}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800">${req.status || 'N/A'}</span></td>
                <td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td>
            </tr>
        `;
    }).join('');

    userTableContainer.innerHTML = `
        <table class="w-full text-left">
            <thead>
                <tr class="bg-gray-50 border-b">
                    <th class="p-3 font-semibold text-gray-600">ID</th>
                    <th class="p-3 font-semibold text-gray-600">Insumo</th>
                    <th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th>
                    <th class="p-3 font-semibold text-gray-600">Estatus</th>
                    <th class="p-3 font-semibold text-gray-600">Fecha</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
};
// VERSIÓN CORREGIDA para script.js

// REEMPLAZA EL BLOQUE ROTO CON ESTA FUNCIÓN COMPLETA en script.js

const renderPendingRequestsTable = () => {
    if (!adminTableContainer) return;
    const pendingRequests = appState.requests.filter(req => req.status === 'Pendiente');

    if (pendingRequests.length === 0) {
        adminTableContainer.innerHTML = '<h3 class="text-xl font-semibold text-gray-800 mb-4">Solicitudes Pendientes</h3><p class="text-gray-500">No hay solicitudes pendientes.</p>';
        return;
    }

    const tableRows = pendingRequests.map(req => {
        // Busca en el catálogo el insumo que coincida con el ID de la solicitud.
        const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
        
        // Usa el nombre del insumo si se encuentra; si no, muestra el ID como respaldo.
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
            <thead>
                <tr class="bg-gray-50 border-b">
                    <th class="p-3 font-semibold text-gray-600">Usuario</th>
                    <th class="p-3 font-semibold text-gray-600">Insumo</th>
                    <th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th>
                    <th class="p-3 font-semibold text-gray-600">Fecha</th>
                    <th class="p-3 font-semibold text-gray-600">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
};

// VERSIÓN CORREGIDA para script.js

const loadReportsView = async () => {
    const totalValueEl = document.getElementById('total-inventory-value');
    const lowStockEl = document.getElementById('low-stock-items-container');
    
    // Muestra estado de carga
    totalValueEl.textContent = 'Calculando...';
    lowStockEl.innerHTML = '<p>Calculando...</p>';

    try {
        const user = netlifyIdentity.currentUser();
        const response = await fetch('/.netlify/functions/generar-reporte', {
            headers: { Authorization: `Bearer ${user.token.access_token}` }
        });
        if (!response.ok) throw new Error('No se pudo generar el reporte.');

        const data = await response.json();
        
        // Formatea el valor total como moneda
        totalValueEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(data.totalInventoryValue || 0);

        // Muestra los items con bajo stock
        if (data.lowStockItems && data.lowStockItems.length > 0) {
            const itemsList = data.lowStockItems.map(item => `
                <div class="flex justify-between items-center p-2 border-b">
                    <span>${item.name}</span>
                    <span class="font-bold text-red-500">${item.stock} / ${item.minStock}</span>
                </div>
            `).join('');
            lowStockEl.innerHTML = itemsList;
        } else {
            lowStockEl.innerHTML = '<p class="text-gray-500">No hay insumos con stock bajo.</p>';
        }

    } catch (error) {
        showToast(error.message, true);
        totalValueEl.textContent = 'Error';
        lowStockEl.innerHTML = '<p class="text-red-500">No se pudo cargar el reporte.</p>';
    }
};

    // --- EVENT LISTENERS ---
// VERSIÓN CORREGIDA para script.js

if (newRequestForm) {
    newRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Deshabilita el botón para evitar envíos duplicados
        const submitButton = document.getElementById('submit-button');
        const buttonText = document.getElementById('button-text');
        const buttonLoader = document.getElementById('button-loader');
        submitButton.disabled = true;
        buttonText.classList.add('hidden');
        buttonLoader.classList.remove('hidden');

        const user = netlifyIdentity.currentUser();
        const selectedItem = appState.catalog.find(item => item.id === newItemSelect.value);
        
        const payload = {
            id: 'SOL-' + new Date().getTime(),
            timestamp: new Date().toISOString(),
            email: user.email,
            item: selectedItem ? selectedItem.id : 'Desconocido', // <--- LÍNEA CORREGIDA
            quantity: parseInt(document.getElementById('quantity-input').value)
        };

        try {
            const response = await fetch('/.netlify/functions/guardar-datos', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { Authorization: `Bearer ${user.token.access_token}` }
            });
            if (!response.ok) throw new Error('Hubo un problema al guardar la solicitud.');
            
            showToast('Solicitud enviada con éxito.');
            newRequestForm.reset();
            await initializeApp(); // Recarga los datos para ver la nueva solicitud
            showView('dashboard-view'); // Vuelve al dashboard

        } catch (error) {
            showToast(`Error: ${error.message}`, true);
        } finally {
            // Vuelve a habilitar el botón
            submitButton.disabled = false;
            buttonText.classList.remove('hidden');
            buttonLoader.classList.add('hidden');
        }
    });
}
    
    if (newEntryForm) {
        newEntryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Registrando...';
            const payload = {
                itemId: document.getElementById('entry-item-select').value,
                quantity: parseInt(document.getElementById('entry-quantity').value),
                cost: parseFloat(document.getElementById('entry-cost').value)
            };
            try {
                const response = await fetch('/.netlify/functions/registrar-entrada', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    headers: { Authorization: `Bearer ${netlifyIdentity.currentUser().token.access_token}` }
                });
                if (!response.ok) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.error || 'Falló el registro de entrada.');
                }
                showToast('Entrada registrada con éxito.');
                newEntryForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                button.disabled = false;
                button.textContent = 'Registrar Entrada';
            }
        });
    }

if (newCatalogForm) {
    newCatalogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.disabled = true;
        button.textContent = 'Añadiendo...';

        const payload = {
            name: document.getElementById('item-name-input').value,
            sku: document.getElementById('item-sku-input').value,
            family: document.getElementById('item-family-input').value,
            unit: document.getElementById('item-unit-input').value,
            description: document.getElementById('item-desc-input').value,
            minStock: parseInt(document.getElementById('item-min-stock-input').value) || 0,
            // Añade otros campos si los necesitas
        };

        try {
            const response = await fetch('/.netlify/functions/crear-insumo', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { Authorization: `Bearer ${netlifyIdentity.currentUser().token.access_token}` }
            });
            if (!response.ok) throw new Error('No se pudo crear el insumo.');

            showToast('Insumo añadido al catálogo con éxito.');
            newCatalogForm.reset();
            await initializeApp(); // Recargamos todo para que el nuevo item aparezca en los dropdowns
        } catch (error) {
            showToast(error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = 'Añadir al Catálogo';
        }
    });
}
    if (adminTableContainer) {
        adminTableContainer.addEventListener('click', async (e) => {
            if (e.target.classList.contains('action-btn')) {
                const button = e.target;
                button.disabled = true;
                button.textContent = '...';
                const { id, action } = button.dataset;
                try {
                    const response = await fetch('/.netlify/functions/actualizar-solicitud', {
                        method: 'POST',
                        body: JSON.stringify({ requestId: id, action: action }),
                        headers: { Authorization: `Bearer ${netlifyIdentity.currentUser().token.access_token}` }
                    });
                    if (!response.ok) throw new Error('Falló la actualización.');
                    showToast(`Solicitud ${action.toLowerCase()}.`);
                    await initializeApp();
                    renderPendingRequestsTable();
                } catch (error) {
                    showToast(error.message, true);
                    button.disabled = false;
                    button.textContent = action;
                }
            }
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = e.currentTarget.dataset.view;
            showView(viewId);
            if (viewId === 'admin-view') {
                renderPendingRequestsTable();
            }
            if (viewId === 'reports-view') {
                loadReportsView();
            }
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const currentUser = netlifyIdentity.currentUser();
            if (!currentUser) return;
            const userRequests = appState.requests.filter(req => req.email === currentUser.email);
            const filteredRequests = userRequests.filter(req => 
                (req.item && req.item.toLowerCase().includes(searchTerm)) ||
                (req.status && req.status.toLowerCase().includes(searchTerm))
            );
            renderUserRequestsTable(filteredRequests);
        });
    }
});