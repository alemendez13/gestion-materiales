// Importar la utilidad de autenticación.
// Se asume que auth.js exporta correctamente la función 'getUserRole'.
const { getUserRole } = require('./auth');

exports.handler = async (event) => {
    // Solo permitir solicitudes POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- INICIO DEL BLOQUE DE SEGURIDAD ESTÁNDAR ---

    // 1. Validar la Clave de API
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { 
            statusCode: 403, 
            body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) 
        };
    }

    try {
        const { userEmail } = JSON.parse(event.body);

        // 2. Validar que el email venga en la solicitud
        if (!userEmail) {
            return { 
                statusCode: 401, 
                body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) 
            };
        }

        // --- FIN DEL BLOQUE DE SEGURIDAD ---


        // --- LÓGICA PRINCIPAL ---
        
        // 3. Obtener el rol del usuario desde Google Sheets usando la función centralizada.
        const role = await getUserRole(userEmail);

        // Si no se encuentra un rol, el usuario no es válido o no está en la lista.
        if (!role) {
            return { 
                statusCode: 403, 
                body: JSON.stringify({ error: 'Usuario no encontrado o sin permisos.' }) 
            };
        }

        // 4. Devolver la respuesta exitosa con el rol del usuario.
        return {
            statusCode: 200,
            body: JSON.stringify({
                email: userEmail,
                role: role 
            })
        };

    } catch (error) {
        console.error('Error en get-profile:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Error interno del servidor.' }) 
        };
    }
};