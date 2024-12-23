import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userAvatarDirPath = path.join(__dirname, 'storage', 'userAvatars');
const userAvatarFormat = 'png';

const userProfileCoverImgDirPath = path.join(__dirname, 'storage', 'userProfileCoverImg');
const userProfileCoverImgFormat = 'png';

export {
    __dirname,
    userAvatarDirPath,
    userAvatarFormat,
    userProfileCoverImgDirPath,
    userProfileCoverImgFormat
}