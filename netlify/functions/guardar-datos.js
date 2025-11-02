// RUTA: netlify/functions/guardar-datos.js

const { google } = require('googleapis');
// NUEVO: Importamos el envoltorio de autenticación 'withAuth'
const { withAuth } = require('./auth');

const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        // Se necesitan permisos de escritura
        scopes: ['https://www.googleapis.com/auth/spreadsheets'], 
    });
};

// MODIFICADO: Envolvemos la función con 'withAuth'
exports.handler = withAuth(async (event) => {
    
    // La validación 'x-api-key' y 'httpMethod' ya no es necesaria aquí.
    // 'withAuth' maneja la seguridad y 'netlify.toml' (o el frontend) el método.
    // Pero mantenemos la del método por buena práctica.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ELIMINADO ---
    // La validación de 'x-api-key' y la llamada a 'getUserRole'
    // ahora son manejadas por 'withAuth'.

    try {
        const item = JSON.parse(event.body);

        // --- INICIO DE LA LÓGICA DE AUTENTICACIÓN MEJORADA ---

        // 1. Obtenemos el email y rol desde 'event.auth' (inyectado por withAuth)
        // Esto soluciona la Falla S-1 (Suplantación)
        const userEmail = event.auth.email; 
        const userRole = event.auth.role;

        // 2. 'withAuth' ya validó que el usuario existe, así que 'userRole' es confiable.
        // Mantenemos la lógica de que cualquier usuario puede solicitar.
        if (!userRole) {
            // Esta comprobación es redundante si 'withAuth' funciona, pero es una buena defensa.
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Usuario no válido.' }) };
        }
    
        // 3. Validamos los datos del payload
        if (!item.id || !item.timestamp || !item.email || !item.item || !item.quantity) {
             return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos en la solicitud.' }) };
        }
    
        const quantity = parseInt(item.quantity);
        if (isNaN(quantity) || quantity <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'La cantidad debe ser un número mayor a cero.' }) };
        }

        // 4. CORRECCIÓN DE LA FALLA M-3 (Anti-Suplantación Rota)
        // Esta validación ahora funciona, porque 'userEmail' es del token
        // y 'item.email' es del payload del formulario.
        if (item.email.toLowerCase() !== userEmail.toLowerCase()) {
            return { statusCode: 403, body: JSON.stringify({ error: 'No puedes crear solicitudes para otro usuario.' }) };
        }

        // --- FIN DE LA LÓGICA DE AUTENTICACIÓN ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'SOLICITUDES!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [item.id, item.timestamp, item.email, item.item, quantity, 'Pendiente']
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Datos guardados exitosamente.' }) };
    
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});