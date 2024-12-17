import { runQuery } from "./databaseSetup.js";
import fs from "fs";
import path from "path";
import { userAvatarDirPath, userAvatarFormat } from "./config.js";

async function getNotifications(userId) {
    const notifications = await runQuery("SELECT * FROM notifications WHERE user_id = $1 ORDER BY notification_id DESC", [userId]);
    if(notifications.length === 0) return notifications;
    
    // Get sender avatar
    notifications.forEach(notification => {
        const filePath = path.join(userAvatarDirPath, `user_avatar_${notification.sender_id}.${userAvatarFormat}`);
        if(fs.existsSync(filePath)) {
            const avatarBuffer = fs.readFileSync(filePath);
            const base64avatar = Buffer.from(avatarBuffer).toString('base64');
            const avatar = `data:image/${userAvatarFormat};base64,${base64avatar}`;
            notification.sender_avatar = avatar;
        } 
    })

    return notifications;
}

export { getNotifications }