import fs from 'fs'
import path from 'path'

/**
 * Copia archivos y directorios a un directorio destino
 * @param {string[]} entradas - Arreglo de rutas de archivos o directorios
 * @param {string} destino - Directorio destino
 */
function copiarEntradas(entradas, destino) {
  // Crear destino si no existe
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true })
  }

  entradas.forEach((ruta) => {
    const nombre = path.basename(ruta)
    const rutaDestino = path.join(destino, nombre)

    try {
      // Soporta archivos y directorios
      fs.cpSync(ruta, rutaDestino, { recursive: true })
      console.log(`Copiado: ${ruta} → ${rutaDestino}`)
    } catch (err) {
      console.error(`Error al copiar ${ruta}:`, err.message)
    }
  })
}

// Ejemplo de uso
const entradasParaCopiar = ['popup.html', 'manifest.json', 'public', 'src/styles']

const directorioDestino = './dist'

copiarEntradas(entradasParaCopiar, directorioDestino)
