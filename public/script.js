document.addEventListener('DOMContentLoaded', () => {
    // --- INYECCIÓN DE CLAVE API Y EMAIL (FASE 2.A) ---
    // La clave es inyectada globalmente por Netlify en index.html
    const APP_API_KEY = window.APP_API_KEY_PUBLIC;
    let userEmail = localStorage.getItem('userEmail') || null;
    // --- ESTADO DE LA APLICACIÓN ---
    let appState = {
        requests: [],
        catalog: [],
        // userProfile ya no se inicializa con Netlify Identity
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
        
        // La ul de navegación también se debe mostrar
        const navUl = document.getElementById('main-nav');
        if(navUl) navUl.classList.remove('hidden');
        
        // Compara el rol sin importar espacios o mayúsculas/minúsculas.
        if (profile && profile.role && profile.role.trim().toLowerCase() === 'admin') {
            if (adminNavLink) adminNavLink.classList.remove('hidden');
            if (reportsNavLink) reportsNavLink.classList.remove('hidden');
        } else {
            if (adminNavLink) adminNavLink.classList.add('hidden');
            if (reportsNavLink) reportsNavLink.classList.add('hidden');
        }
    };

// --- LÓGICA DE OBTENCIÓN DE ROL (OPTIMIZADA) ---
const fetchRole = async (email) => {
    try {
        // Realiza UNA ÚNICA llamada a la nueva función de backend.
        const response = await fetch('/.netlify/functions/get-profile', {
            method: 'POST',
            headers: { 
                'x-api-key': APP_API_KEY, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ userEmail: email })
        });

        // Si la respuesta no es exitosa (ej. 403, 404, 500), lanza un error.
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'No se pudo verificar el usuario.');
        }

        // Si es exitosa, extrae el rol del cuerpo de la respuesta.
        const profile = await response.json();
        return profile.role; // Devuelve directamente el rol (ej. 'admin' o 'user')

    } catch (error) {
        // Muestra el error en la consola y al usuario para mejor depuración.
        console.error("Error al obtener el rol:", error.message);
        showToast(error.message, true); // Opcional: notificar al usuario.
        return null; 
    }
};

    // --- LÓGICA DE LOGIN MANUAL (REEMPLAZO TOTAL DE NETLIFY IDENTITY) ---
    const handleManualLogin = async () => {
        let email = userEmail;
        if (!email) {
            email = prompt("Por favor, introduce tu email (para la validación del rol):");
        }

        if (email) {
            email = email.trim().toLowerCase();
            userEmail = email;
            localStorage.setItem('userEmail', email);

            // Cargar el rol antes de cargar la app
            const role = await fetchRole(email);
            appState.userProfile = { email: email, role: role || 'user' }; 
            window.USER_ROLE = role || 'user';
            
            showAppForUser(appState.userProfile);
            await initializeApp();
            
        } else {
            alert("El email es necesario para iniciar la aplicación. Recarga la página para intentarlo.");
        }
    };

    // --- LÓGICA DE INICIALIZACIÓN DE LA APP ---
    const initializeApp = async () => {
        if (loader) loader.classList.remove('hidden');
        if (content) content.classList.add('hidden');

        // --- ADAPTACIÓN AL PLAN 2 ---
        if (!userEmail) { // Si userEmail es nulo, la app no ha iniciado sesión
             handleManualLogin();
             return; // Detener la inicialización si no hay email
        }
        
        try {
            // Reemplazamos las llamadas fetch con la seguridad API Key + Email en el body
            const [requestsRes, catalogRes] = await Promise.all([
                fetch('/.netlify/functions/leer-datos', { 
                    method: 'POST',
                    headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: userEmail }) // Adjuntamos el email para filtrar los datos
                }),
                fetch('/.netlify/functions/leer-catalogo', { 
                    method: 'POST', // Usar POST para adjuntar la clave API es el estándar en tu proyecto
                    headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: userEmail }) // Adjuntamos email aunque no filtre el catálogo, valida el acceso
                })
            ]);


            if (!requestsRes.ok || !catalogRes.ok) {
                // Si falla el acceso, podría ser la API Key o el email, el backend devuelve 403 o 401
                const errorData = await requestsRes.json();
                throw new Error(errorData.error || 'No se pudieron cargar los datos iniciales.');
            }
            
            appState.requests = await requestsRes.json();
            appState.catalog = await catalogRes.json();
            
            const userRequests = appState.requests;
            renderUserRequestsTable(userRequests);
            
            populateCatalogDropdowns();
            if (loader) loader.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            showView('dashboard-view');

        } catch (error) {
            showToast(error.message, true);
        }
    };
    // --- FUNCIONES AUXILIARES Y DE RENDERIZADO (sin cambios) ---
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
        views.forEach(view => view.classList.add('hidden'));
        const activeView = document.getElementById(viewId);
        if (activeView) activeView.classList.remove('hidden');
        navLinks.forEach(link => {
            const parentLi = link.closest('li');
            parentLi.classList.toggle('bg-gray-200', link.dataset.view === viewId);
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
        if (!userTableContainer) return;
        if (!requestsToRender || requestsToRender.length === 0) {
            userTableContainer.innerHTML = '<p class="text-gray-500">No tienes solicitudes por el momento.</p>';
            return;
        }
        const tableRows = requestsToRender.map(req => {
            const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
            const itemName = catalogItem ? catalogItem.name : (req.item || 'Desconocido');
            return `
                <tr class="border-b">
                    <td class="p-3">${req.id || 'N/A'}</td>
                    <td class="p-3">${itemName}</td>
                    <td class="p-3 text-center">${req.quantity || 'N/A'}</td>
                    <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800">${req.status || 'N/A'}</span></td>
                    <td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td>
                </tr>
            `;
        }).join('');
        userTableContainer.innerHTML = `
            <table class="w-full text-left">
                <thead><tr class="bg-gray-50 border-b"><th class="p-3 font-semibold text-gray-600">ID</th><th class="p-3 font-semibold text-gray-600">Insumo</th><th class="p-3 font-semibold text-gray-600 text-center">Cantidad</th><th class="p-3 font-semibold text-gray-600">Estatus</th><th class="p-3 font-semibold text-gray-600">Fecha</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
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
                    <td class="p-3">${req.email}</td><td class="p-3">${itemName}</td><td class="p-3 text-center">${req.quantity}</td><td class="p-3 text-sm text-gray-500">${new Date(req.timestamp).toLocaleDateString()}</td>
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
        totalValueEl.textContent = 'Calculando...';
        lowStockEl.innerHTML = '<p>Calculando...</p>';
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
        } catch (error) {
            showToast(error.message, true);
            totalValueEl.textContent = 'Error';
            lowStockEl.innerHTML = '<p class="text-red-500">No se pudo cargar el reporte.</p>';
        }
    };

    // --- EVENT LISTENERS (sin cambios, solo se quita la cabecera x-user-roles) ---
    if (newRequestForm) {
        newRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button');
            submitButton.disabled = true;
            const payload = {
                id: 'SOL-' + new Date().getTime(), timestamp: new Date().toISOString(), 
                email: userEmail, // Usa la variable global
                item: newItemSelect.value, quantity: parseInt(document.getElementById('quantity-input').value)
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
            const payload = {
                itemId: document.getElementById('entry-item-select').value, quantity: parseInt(document.getElementById('entry-quantity').value),
                cost: parseFloat(document.getElementById('entry-cost').value), provider: document.getElementById('entry-provider').value,
                invoice: document.getElementById('entry-invoice').value, expirationDate: document.getElementById('entry-expiration').value,
                serialNumber: document.getElementById('entry-serial').value,
                userEmail: userEmail // Añade el email para la auditoría y el rol check
            };
            try {
                const response = await fetch('/.netlify/functions/registrar-entrada', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-api-key': APP_API_KEY, 'Content-Type': 'application/json' } });
                if (!response.ok) throw new Error((await response.json()).error || 'Falló el registro.');
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
                name: document.getElementById('item-name-input').value, sku: document.getElementById('item-sku-input').value,
                family: document.getElementById('item-family-input').value, unit: document.getElementById('item-unit-input').value,
                description: document.getElementById('item-desc-input').value, minStock: parseInt(document.getElementById('item-min-stock-input').value) || 0,
                serialNumber: document.getElementById('item-serial-input').value,
                userEmail: userEmail // Añade el email para la auditoría y el rol check
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

    if (adminTableContainer) {
        adminTableContainer.addEventListener('click', async (e) => {
            if (e.target.classList.contains('action-btn')) {
                const button = e.target;
                button.disabled = true; button.textContent = '...';
                const { id, action } = button.dataset;
                try {
                    const response = await fetch('/.netlify/functions/actualizar-solicitud', {
                        method: 'POST', body: JSON.stringify({ requestId: id, action: action, approverEmail: userEmail }),
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

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            const userRequests = appState.requests;
            const filteredRequests = userRequests.filter(req => {
                const catalogItem = appState.catalog.find(cItem => cItem.id === req.item);
                const itemName = catalogItem ? catalogItem.name : '';
                return (itemName && itemName.toLowerCase().includes(searchTerm)) ||
                       (req.status && req.status.toLowerCase().includes(searchTerm));
            });
            renderUserRequestsTable(filteredRequests);
        });
    }

        // --- LLAMADA INICIAL DE LA APLICACIÓN (CORREGIDA) ---
    // Esta llamada ahora está DENTRO del DOMContentLoaded,
    // por lo que se ejecutará en el momento correcto.
    handleManualLogin();

});