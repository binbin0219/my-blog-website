import { userAvatarDirPath, userAvatarFormat, userProfileCoverImgDirPath, userProfileCoverImgFormat } from "./config.js";
import { runQuery } from "./databaseSetup.js";
import fs from "fs";
import path from "path";
import { generateRandomAvatar } from "./index.js";

async function getUserData(userId) {
    const result = await runQuery("SELECT * FROM users WHERE user_id = $1", [userId]);
    const user = result[0];
    if(!user) return null;
    user.avatar = await getUserAvatar(userId);
    return user;
}

async function getUserAvatar(userId) {
    // Get user avatar
    const filePath = path.join(userAvatarDirPath, `user_avatar_${userId}.${userAvatarFormat}`);
    const avatarBuffer = fs.existsSync(filePath) ? fs.readFileSync(filePath) : await generateRandomAvatar();
    const base64avatar = Buffer.from(avatarBuffer).toString('base64');
    const avatar = `data:image/${userAvatarFormat};base64,${base64avatar}`
    return avatar;
}

function getUserProfileCover(userId) {
    const filePath = path.join(userProfileCoverImgDirPath, `user_cover_${userId}.${userProfileCoverImgFormat}`);
    if(!fs.existsSync(filePath)) return;
    const coverBuffer = fs.readFileSync(filePath);
    const base64cover = Buffer.from(coverBuffer).toString('base64');
    const cover = `data:image/${userProfileCoverImgFormat};base64,${base64cover}`
    return cover;
}

export { getUserData, getUserAvatar, getUserProfileCover };