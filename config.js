import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userAvatarDirPath = path.join(__dirname, 'storage', 'userAvatars');
const userAvatarFormat = 'png';

export {
    __dirname,
    userAvatarDirPath,
    userAvatarFormat
}