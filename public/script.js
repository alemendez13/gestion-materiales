document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DEL DOM ---
    const loader = document.getElementById('loader');
    const content = document.getElementById('content');
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    const newRequestForm = document.getElementById('new-request-form');
    const submitButton = document.getElementById('submit-button');
    const buttonText = document.getElementById('button-text');
    const buttonLoader = document.getElementById('button-loader');
    const tableContainer = document.getElementById('requests-table-container');

    // --- FUNCIONES DE UI ---
    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 p-4 rounded-md text-white ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    };

    const toggleButtonLoading = (isLoading) => {
        submitButton.disabled = isLoading;
        buttonText.classList.toggle('hidden', isLoading);
        buttonLoader.classList.toggle('hidden', !isLoading);
    };

    const showView = (viewId) => {
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.view === viewId);
        });
    };

    // --- LÓGICA DE DATOS ---
    const renderRequestsTable = (requests) => {
        if (!requests || requests.length === 0) {
            tableContainer.innerHTML = '<p>No hay solicitudes para mostrar.</p>';
            return;
        }

        let tableHtml = `<table class="min-w-full bg-white">
            <thead><tr>
                <th class="py-2 px-4 border-b">ID</th>
                <th class="py-2 px-4 border-b">Fecha</th>
                <th class="py-2 px-4 border-b">Solicitante</th>
                <th class="py-2 px-4 border-b">Insumo</th>
                <th class="py-2 px-4 border-b">Cantidad</th>
                <th class="py-2 px-4 border-b">Estatus</th>
            </tr></thead><tbody>`;

        requests.forEach(req => {
            tableHtml += `<tr>
                <td class="py-2 px-4 border-b">${req.id}</td>
                <td class="py-2 px-4 border-b">${new Date(req.timestamp).toLocaleDateString()}</td>
                <td class="py-2 px-4 border-b">${req.email}</td>
                <td class="py-2 px-4 border-b">${req.item}</td>
                <td class="py-2 px-4 border-b">${req.quantity}</td>
                <td class="py-2 px-4 border-b">${req.status}</td>
            </tr>`;
        });

        tableHtml += '</tbody></table>';
        tableContainer.innerHTML = tableHtml;
    };

    const initializeApp = async () => {
        try {
            const response = await fetch('/.netlify/functions/leer-datos');
            if (!response.ok) throw new Error('No se pudieron cargar los datos.');
            
            const requests = await response.json();
            renderRequestsTable(requests);

            loader.classList.add('hidden');
            content.classList.remove('hidden');
            showView('dashboard-view');

        } catch (error) {
            showToast(error.message, true);
        }
    };

    // --- EVENT LISTENERS ---
    newRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        toggleButtonLoading(true);

        const payload = {
            id: 'SOL-' + new Date().getTime(),
            timestamp: new Date().toISOString(),
            email: document.getElementById('user-email').value,
            item: document.getElementById('item-name').value,
            quantity: parseInt(document.getElementById('quantity-input').value)
        };
        
        try {
            const response = await fetch('/.netlify/functions/guardar-datos', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Hubo un problema al guardar.');

            showToast('Solicitud enviada con éxito.');
            newRequestForm.reset();
            initializeApp(); // Recargar los datos de la tabla
            showView('dashboard-view');
        } catch (error) {
            showToast(`Error: ${error.message}`, true);
        } finally {
            toggleButtonLoading(false);
        }
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showView(e.currentTarget.dataset.view);
        });
    });

    // --- INICIAR LA APP ---
    initializeApp();
});