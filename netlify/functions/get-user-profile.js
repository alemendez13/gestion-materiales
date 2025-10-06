const { getUserRole } = require('./utils/auth');

/**
 * Endpoint para que el frontend obtenga el perfil (email y rol)
 * del usuario actualmente autenticado.
 */
exports.handler = async (event, context) => {
    // 1. Obtenemos el usuario del contexto de la función de Netlify.
    const user = context.clientContext && context.clientContext.user;

    // 2. Si no hay usuario, significa que la petición no está autenticada.
    if (!user) {
        return {
            statusCode: 401, // No autorizado
            body: JSON.stringify({ error: 'Debes iniciar sesión para obtener tu perfil.' }),
        };
    }

    // --- BLOQUE DE DIAGNÓSTICO ---
    console.log(`Verificando rol para el usuario: ${user.email}`);
    
    // 3. Usamos nuestra función auxiliar para buscar el rol en Google Sheets.
    const role = await getUserRole(user.email);
    
    console.log(`Rol obtenido desde Google Sheets: ${role}`); // Esto te dirá si obtuvo 'admin' o 'null'
    // --- FIN DEL BLOQUE DE DIAGNÓSTICO ---

    // 4. Devolvemos una respuesta exitosa con el email y el rol del usuario.
    //    Si el rol no se encuentra en la hoja, se asigna 'user' por defecto.
    return {
        statusCode: 200, // OK
        body: JSON.stringify({
            email: user.email,
            role: role || 'user', 
        }),
    };
};