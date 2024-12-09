import jwt from "jsonwebtoken"
import path from "path"
import { runQuery } from "../databaseSetup.js";
import fs from "fs"
import { userAvatarDirPath, userAvatarFormat } from "../config.js";

const jwtSecret = '1283fc47b7cd439a7f8e36e614a41fe519be35088befd42bc2fdf7130a646e9a75685b';
function isUserAuthorized(req, res, next) {
    const token = req.cookies.jwt;
    if(token){
        jwt.verify(token, jwtSecret, async (err, decodedToken) => {
            if(err) {
                console.log(err);
                return res.redirect('/login');
            } else {
                // Get user data and its avatar
                const user = await runQuery("SELECT * FROM users WHERE user_id = $1", [decodedToken.userid]);
                const filePath = path.join(userAvatarDirPath, `user_avatar_${user[0].user_id}.${userAvatarFormat}`);
                if(fs.existsSync(filePath)) {
                    const avatarBuffer = fs.readFileSync(filePath);
                    const base64avatar = Buffer.from(avatarBuffer).toString('base64');
                    const avatar = `data:image/${userAvatarFormat};base64,${base64avatar}`;
                    user[0].avatar = avatar;
                }
                user[0].account_name = user[0].account_name.slice(-2);
                user[0].password = null;
                res.locals.user = user[0];
                next();
            }
        });
    } else {
        return res.redirect('/login');
    }
}

function authenticateToken(req, res, next) {
    const token = req.cookies.jwt;
    if(!token) return res.status(401).send('Unauthorized');
    jwt.verify(token, jwtSecret, async (err, decodedToken) => {
        if(err) return res.status(401).send('Unauthorized');
        req.user = decodedToken;
        next();
    });
}

export {isUserAuthorized, authenticateToken}