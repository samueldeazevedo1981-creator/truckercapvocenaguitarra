export async function repertoire(action, value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('TRUCKER_CAP_REPERTOIRE', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('songs', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('songs', action === 'get' || action === 'keys' ? 'readonly' : 'readwrite');
      const songs = tx.objectStore('songs');
      const request = action === 'keys' ? songs.getAllKeys() : songs[action](value);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
