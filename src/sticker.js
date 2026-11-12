import sharp from 'sharp';

/**
 * Añade metadata EXIF al buffer WebP para que WhatsApp reconozca el autor y paquete del sticker.
 */
function addExifMetadata(webpBuffer, packName = 'Mi Bot', author = 'Bot US') {
    const json = {
        'sticker-pack-id': 'whatsapp-bot-sticker',
        'sticker-pack-name': packName,
        'sticker-pack-publisher': author,
        'emojis': ['🤖', '✨']
    };

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);

    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    // Header WebP: RIFF [size] WEBP
    // Buscar si ya tiene chunk EXIF o insertar antes del final
    return Buffer.concat([webpBuffer, exif]);
}

/**
 * Convierte un buffer de imagen a sticker WebP optimizado para WhatsApp (512x512).
 */
export async function createSticker(imageBuffer, packName = 'Stickers', author = 'Mi Bot') {
    try {
        const processed = await sharp(imageBuffer)
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 75 })
            .toBuffer();

        return processed;
    } catch (err) {
        throw new Error(`Error al procesar sticker: ${err.message}`);
    }
}
