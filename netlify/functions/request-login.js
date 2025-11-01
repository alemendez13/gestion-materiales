// RUTA: netlify/functions/request-login.js

const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { getUserRole } = require('./auth'); // Reutilizamos el módulo de autenticación

// Configuración del cliente de Google (con permisos de ESCRITURA)
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        // ¡Importante! Se necesitan permisos de escritura para la hoja de tokens.
        scopes: ['https://www.googleapis.com/auth/spreadsheets'], 
    });
};

// Configuración de Nodemailer (la misma que ya tenías)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true, 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

exports.handler = async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email } = JSON.parse(event.body);

        if (!email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Email requerido.' }) };
        }

        const userEmail = email.trim().toLowerCase();

        // --- INICIO DE LA LÓGICA DE SEGURIDAD ---

        // 1. Verificar que el usuario exista en la hoja USUARIOS
        const userRole = await getUserRole(userEmail);
        if (!userRole) {
            // ¡Importante! Devolvemos un 200 OK genérico para no confirmar si un email existe o no (prevención de enumeración de usuarios).
            console.warn(`Intento de login fallido (usuario no encontrado): ${userEmail}`);
            return { 
                statusCode: 200, 
                body: JSON.stringify({ message: 'Si tu email está registrado, recibirás un enlace para iniciar sesión.' }) 
            };
        }

        // 2. Generar un token seguro y una fecha de expiración (15 minutos)
        const token = uuidv4();
        const expirationTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos desde ahora

        // 3. Guardar el token en la hoja 'LOGIN_TOKENS'
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'LOGIN_TOKENS!A1', // Escribir en la nueva hoja
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [token, userEmail, expirationTime.toISOString()] // Token, Email, Expires
                ],
            },
        });

        // 4. Enviar el Magic Link por correo
        
        // ¡IMPORTANTE! Reemplaza 'https://tu-sitio.netlify.app' con la URL real de tu sitio.
        const loginLink = `https://gestion-de-insumos.netlify.app#token=${token}`; 

        await transporter.sendMail({
            from: `"Sistema de Inventarios" <${process.env.SMTP_USER}>`,
            to: userEmail,
            subject: 'Tu enlace para iniciar sesión en el Sistema de Inventarios',
            html: `<p>Hola,</p>
                   <p>Haz clic en el siguiente enlace para iniciar sesión. Este enlace es válido por 15 minutos.</p>
                   <p><a href="${loginLink}" style="padding: 10px 15px; background-color: #3498db; color: white; text-decoration: none; border-radius: 5px;">Iniciar Sesión</a></p>
                   <p>Si no solicitaste esto, puedes ignorar este correo.</p>
                   <p>Enlace (si el botón no funciona): ${loginLink}</p>`,
        });

        // 5. Devolver la respuesta genérica
        return { 
            statusCode: 200, 
            body: JSON.stringify({ message: 'Si tu email está registrado, recibirás un enlace para iniciar sesión.' }) 
        };

    } catch (error) {
        console.error('Error en request-login:', error);
        // No filtrar el error al cliente, podría exponer la lógica interna.
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Error interno del servidor.' }) 
        };
    }
};