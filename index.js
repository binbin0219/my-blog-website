import express from "express"
import bodyParser from "body-parser"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"
import databaseSetup, { checkIfAllTablesExist, dropAllTables, insertSampleData, runQuery } from "./databaseSetup.js"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { authenticateToken, isUserAuthorized } from "./middleware/auth.js"
import { __dirname, userAvatarDirPath, userAvatarFormat, userProfileCoverImgDirPath, userProfileCoverImgFormat } from "./config.js"
import { getNotifications } from "./notification.js"
import { saveUser } from "./algoliasearch.js"
import { getUserAvatar, getUserData, getUserProfileCover } from "./user.js"

// Avataaars.io
const maleOptions = {
    topType: ["ShortHairDreads01", "ShortHairDreads02", "ShortHairFrizzle", "ShortHairShaggyMullet", "ShortHairShortCurly"],
    facialHairType: ["BeardMedium", "BeardLight", "Blank"],
    clotheType: ["BlazerShirt", "BlazerSweater", "CollarSweater", "GraphicShirt", "Hoodie", "Overall"],
    eyeType: ["Wink", "Happy", "Default"],
    eyebrowType: ["DefaultNatural", "Default", "RaisedExcited", "RaisedExcitedNatural"],
    mouthType: ["Smile", "Twinkle", "Default"],
    skinColor: ["Light", "Brown", "DarkBrown"],
};
const femaleOptions = {
    topType: ["LongHairBob", "LongHairBun", "LongHairCurly", "LongHairCurvy", "LongHairDreads", "LongHairFrida"],
    facialHairType: ["Blank"],
    clotheType: ["BlazerShirt", "BlazerSweater", "CollarSweater", "GraphicShirt", "Hoodie", "Overall"],
    eyeType: ["Happy", "Wink", "Default"],
    eyebrowType: ["DefaultNatural", "Default", "RaisedExcited", "RaisedExcitedNatural"],
    mouthType: ["Smile", "Twinkle", "Default"],
    skinColor: ["Light", "Brown", "DarkBrown"],
};
export async function generateRandomAvatar(gender) {
    const options = gender === "male" ? maleOptions : femaleOptions;
    const topType = options.topType[Math.floor(Math.random() * options.topType.length)];
    const facialHairType = options.facialHairType[Math.floor(Math.random() * options.facialHairType.length)];
    const clotheType = options.clotheType[Math.floor(Math.random() * options.clotheType.length)];
    const eyebrowType = options.eyebrowType[Math.floor(Math.random() * options.eyebrowType.length)];
    const mouthType = options.mouthType[Math.floor(Math.random() * options.mouthType.length)];
    const skinColor = options.skinColor[Math.floor(Math.random() * options.skinColor.length)];
    const avatar = await fetch(`https://avataaars.io/?avatarStyle=Circle&topType=${topType}&facialHairType=${facialHairType}&clotheType=${clotheType}&eyebrowType=${eyebrowType}&mouthType=${mouthType}&skinColor=${skinColor}`);
    const avatarSVG = await avatar.text();
    return avatarSVG;
}

await dropAllTables();

// Connect to the database
const isAllTablesExist = await checkIfAllTablesExist();
console.log(isAllTablesExist);
if(isAllTablesExist === false) {
    await databaseSetup();
    insertSampleData();
}

const app = express();
app.use(express.json({ limit: '10mb' })); // Increase JSON payload size
const port = process.env.PORT || 4000;
const jwtSecret = '1283fc47b7cd439a7f8e36e614a41fe519be35088befd42bc2fdf7130a646e9a75685b';
let user = [];
let posts = [];
let likes = [];
let comments = [];

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cookieParser());

app.get('/login', async (req, res) => {
    res.render("login.ejs");
});

app.get('/sign-up', async (req, res) => {
    res.render("sign-up-page.ejs");
})

app.get('/profile-setting', isUserAuthorized, async (req, res) => {
    res.render("profile-setting.ejs");
})

app.get('/settings', isUserAuthorized, async (req, res) => {
    res.locals.routeName = "settings";
    res.render("settings-page.ejs");
})

app.get('/user/profile/:user_id', isUserAuthorized, async (req, res) => {
    if(!req.params.user_id || !req.params.user_id.match(/^[0-9]+$/)) return res.status(404).json({message: "User not found"});
    res.locals.routeName = "user.profile";
    const relatedUsersId = [];
    const relatedUsers = [];
    const foundUser = await runQuery("SELECT * FROM users WHERE user_id = $1", [req.params.user_id]);
    foundUser[0].password = undefined;
    foundUser[0].accountName = undefined;
    foundUser[0].avatar = await getUserAvatar(req.params.user_id);
    foundUser[0].profile_cover = getUserProfileCover(req.params.user_id);

    // Identify if is friend with current user
    const friendship = await runQuery(
        "SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)", [
        res.locals.user.user_id, 
        req.params.user_id
    ]);
    if(friendship.length > 0) foundUser[0].friendship = {
        status: friendship[0].status,
        sender_id: friendship[0].sender_id
    }

    // Get all posts from user
    const userPosts = await runQuery("SELECT * FROM posts WHERE user_id = $1 ORDER BY post_id DESC", [req.params.user_id]);

    // Add users id related to userPosts
    if(userPosts) {
        for(const post of userPosts) {
            // Add liked users
            const likedUsers = await runQuery("SELECT * FROM likes WHERE post_id = $1", [post.post_id]);
            post.likedUsers = likedUsers;
    
            // Add total comments
            const comments = await runQuery("SELECT * FROM comments WHERE post_id = $1", [post.post_id]);
            post.comments = comments;
    
            const isUserAdded = relatedUsers.find(user => user.user_id === post.user_id);
            if(isUserAdded !== undefined) return;
            relatedUsersId.push(post.user_id);
        }
    }

    // Get all users data from relatedUsersId
    if(relatedUsersId.length > 0){
        let queryCondition = relatedUsersId.map((_, index) => `$${index + 1}`).join(", ");
        const queryString = `SELECT * FROM users WHERE user_id IN (${queryCondition})`;
        const foundUsers = await runQuery(queryString, relatedUsersId);
        if(!foundUsers) return;
        foundUsers.forEach((user) => {
            user.password = null;
            user.accountName = null;

            const filePath = path.join(userAvatarDirPath, `user_avatar_${user.user_id}.${userAvatarFormat}`);
            if(!fs.existsSync(filePath)) return;

            const avatarBuffer = fs.readFileSync(filePath);
            const base64avatar = Buffer.from(avatarBuffer).toString('base64');
            user.avatar = `data:image/${userAvatarFormat};base64,${base64avatar}`

            relatedUsers.push(user);
        })
    }

    res.locals.profile_user = foundUser[0];
    res.locals.posts = userPosts;
    res.locals.related_users = relatedUsers;
    res.render("user-profile.ejs");
})

// Initial_Page
app.get('/', isUserAuthorized, async (req, res) => {  
    res.locals.routeName = "home";

    if(res.locals.user) {
        let relatedUsersId = [];
        let relatedUsers = [];
        posts = await runQuery("SELECT * FROM posts ORDER BY post_id DESC");
        likes = await runQuery("SELECT * FROM likes");
        comments = await runQuery("SELECT * FROM comments ORDER BY comment_id DESC");

        // Add users id related to userPosts
        if(posts) {
            for(const post of posts) {
                // Add liked users
                const likedUsers = await runQuery("SELECT * FROM likes WHERE post_id = $1", [post.post_id]);
                post.likedUsers = likedUsers;
        
                // Add total comments
                const comments = await runQuery("SELECT * FROM comments WHERE post_id = $1", [post.post_id]);
                post.comments = comments;
        
                const isUserAdded = relatedUsers.find(user => user.user_id === post.user_id);
                if(isUserAdded !== undefined) return;
                relatedUsersId.push(post.user_id);
            }
        }

        if(comments) {
            // Add users related to comments
            comments.forEach(async (comment) => {
                const isUserAdded = relatedUsers.find(user => user.user_id === comment.user_id);
                if(isUserAdded) return;
                relatedUsersId.push(comment.user_id);
            })
        }

        // Get all users data from relatedUsersId
        if(relatedUsersId.length > 0){
            let queryCondition = relatedUsersId.map((_, index) => `$${index + 1}`).join(", ");
            const queryString = `SELECT * FROM users WHERE user_id IN (${queryCondition})`;
            const foundUsers = await runQuery(queryString, relatedUsersId);
            if(!foundUsers) return;
            for(const user of foundUsers) {
                user.password = null;
                user.accountName = null;
                user.avatar = await getUserAvatar(user.user_id);
                relatedUsers.push(user);
            }
        }
        
        res.render("blog.ejs", {
            posts: posts,
            likes: likes,
            comments: comments,
            relatedUsers: relatedUsers
        });
    }
});

//handlers for sign up
app.post("/signing-up", async (req, res) => {
    const users = await runQuery("SELECT * FROM users");
    const hashedPassword = await bcrypt.hash(req.body.Password,10);    
    const nextUserId = users[0] ? users[users.length - 1].user_id + 1 : 1;

    try {
        // Ensure the directory exists
        if (!fs.existsSync(userAvatarDirPath)) {
            fs.mkdirSync(userAvatarDirPath, { recursive: true });
        }
        
        // Generate a random avatar and save it
        const avatar = await generateRandomAvatar((req.body.Gender).toLowerCase());
        sharp(Buffer.from(avatar))
        // .png({ quality: 90, compressionLevel: 9, force: true })  // force PNG format and set transparency
        .toFormat(`${userAvatarFormat}`)
        .toFile(userAvatarDirPath + `/user_avatar_${nextUserId}.${userAvatarFormat}`);

        // Insert the new user
        const queryString = 'INSERT INTO users VALUES '
        const insertedRow = await runQuery("INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [
            nextUserId,
            req.body.accountName.trim(), 
            req.body.Gender,
            req.body.Username.trim(), 
            req.body.firstName.trim(),
            req.body.lastName.trim(),
            hashedPassword
        ])

        // Create friendship by first user which is me the developer of this project
        if(nextUserId !== 1) {
            const firstUser = await runQuery("SELECT * FROM users WHERE user_id = $1", [1]);
            const friend_id = nextUserId;
            await runQuery("INSERT INTO friendships (user_id, friend_id, sender_id, status) VALUES ($1, $2, $3, $4)", [firstUser[0].user_id, friend_id, firstUser[0].user_id, 'pending']);
            await runQuery("INSERT INTO friendships (user_id, friend_id, sender_id, status) VALUES ($1, $2, $3, $4)", [friend_id, firstUser[0].user_id, firstUser[0].user_id, 'pending']);

            // Create friend request notification
            await runQuery("INSERT INTO notifications (user_id, sender_id, type, content, link) VALUES ($1, $2, $3, $4, $5)" , [
                friend_id,
                firstUser[0].user_id,
                "friend_request",
                `${firstUser[0].username} sent you a friend request`,
                `/user/profile/${firstUser[0].user_id}`
            ]);
        }

        // Add user to agolia
        saveUser({
            objectID: insertedRow[0].user_id,
            user_id: insertedRow[0].user_id,
            username: insertedRow[0].username,
        })

        // Generate a JWT
        const maxAge = 3 * 60 * 60;
        const token = jwt.sign(
            {user_id: insertedRow[0].user_id, username: insertedRow[0].username},
            jwtSecret,
            {expiresIn: maxAge}
        );

        // Set the cookie
        res.cookie("jwt", token, {
            httpOnly: true,
            maxAge: maxAge * 1000,
        });

        res.render('sign-up-successful.ejs');
    } catch (error) {
        console.log(error);
        // Redirect to sign-up page
        res.redirect('/sign-up');
    }

})

// Logout
app.get("/logout", (req, res) => {
    res.cookie("jwt", "", {maxAge: 1});
    res.redirect("/");
})

app.post("/verify-account-name", async (req, res) => {
    const foundUser = await runQuery("SELECT * FROM users WHERE username = $1", [req.body.accountName]);
    if (foundUser[0]) { res.json({ isAccountNameAlreadyExisted: true }); console.log("user existed") } else { res.json({ isAccountNameAlreadyExisted: false }); console.log("user not exist") }
})

app.post("/verify-password", async (req, res) => {
    const foundPassword = await runQuery("SELECT password FROM users WHERE username = $1", [req.body.username]);

    if (foundPassword[0]) {//check if the coresponding user's password in database is found or not

        bcrypt.compare(req.body.password,foundPassword[0].password).then((result)=> {
            result
            ?
            res.json({ isPasswordCorrect: true }) //password correct
            :
            res.json({ isPasswordCorrect: false })// password incorrect
        })
        
    } else {
        res.json({ isPasswordCorrect: false }) //user not found
    }


})

//handlers for login
app.post('/logging-in', async (req, res) => {
    await runQuery("SELECT * FROM users WHERE username = $1",[req.body.Username])
    .then((foundUser) => {
        const maxAge = 3 * 60 * 60;
        const token = jwt.sign(
            {user_id: foundUser[0].user_id, username: foundUser[0].username},
            jwtSecret,
            {expiresIn: maxAge}
        );
        res.cookie("jwt", token, {
            httpOnly: true,
            maxAge: maxAge * 1000,
        });
    })

    res.redirect('/');
})

//handlers for blog app
app.post('/create-post', async (req,res)=> {
    var currentDate = new Date();
    var dateString = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1) + '-' + currentDate.getDate();
    var timeString = currentDate.getHours() + ':' + currentDate.getMinutes();
    var currentDateTime = dateString + ' ' + timeString;

    const result = await runQuery("SELECT post_id FROM posts ORDER BY post_id DESC LIMIT 1");
    const username = await runQuery("SELECT username FROM users WHERE user_id = $1",[req.body.userId]);

    await runQuery("INSERT INTO posts VALUES($1,$2,$3,$4,$5,$6)", [
        req.body.userId,
        result[0] ? result[0].post_id + 1 : 1,
        req.body.title,
        req.body.content.replace(/\r\n/g, '\n'),
        currentDateTime,
        username[0].username
    ]);

    res.redirect('/');
})

app.post('/update-post', async (req,res)=> {
    runQuery("UPDATE posts SET title = $1, content = $2 WHERE post_id = $3",
    [req.body.title, req.body.content, req.body.postId])
    .then(()=> res.status(200).json({message: "Update successful"}))
    .catch(error => {
        console.log(error);
        res.status(500).json({message: "Update unsuccessul"});
    })
})

app.post('/delete-post',(req,res) =>{
    runQuery("DELETE FROM posts WHERE post_id = $1" , [req.body.postId])
    .then(()=> res.status(201).json({message: "Delete successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete failed"})
    })
})

app.post('/like-post',async (req,res)=> {
    const like = await runQuery("SELECT like_id FROM likes ORDER BY like_id DESC LIMIT 1");

    runQuery("INSERT INTO likes VALUES($1,$2,$3)" , [
        like[0] ? like[0].like_id + 1 : 1,
        req.body.userId,
        req.body.postId
    ])
    .then(async ()=> {
        const post = await runQuery("SELECT * FROM posts WHERE post_id = $1", [req.body.postId]);
        const senderName = await runQuery("SELECT username FROM users WHERE user_id = $1", [req.body.userId]);

        // Create notification if user is not the post owner
        if(Number(post[0].user_id) !== Number(req.body.userId)) {
            await runQuery("INSERT INTO notifications (user_id, sender_id, type, content, link) VALUES ($1, $2, $3, $4, $5)" , [
                post[0].user_id,
                Number(req.body.userId),
                "like",
                `${senderName[0].username} liked your post "${post[0].title}"`,
                `/post/${req.body.postId}`
            ])
        }

        res.status(201).json({message: "Like post successfully"});
    })
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Like post failed"})
    })
})

app.post('/delete-like-post',(req,res)=> {

    runQuery("DELETE FROM likes WHERE post_id = $1 AND user_id = $2" , [req.body.postId, req.body.userId])
    .then(()=> res.status(201).json({message: "Delete like post successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete like post failed"})
    })
})

app.post('/create-comment', async (req,res)=> {

    const commentId = await runQuery("SELECT comment_id FROM comments ORDER BY comment_id DESC LIMIT 1");

    runQuery("INSERT INTO comments VALUES ($1,$2,$3,$4,$5) RETURNING *",[
        commentId[0] ? commentId[0].comment_id + 1 : 1,
        req.body.postId,
        req.body.userId,
        req.body.username,
        req.body.content.replace(/\r\n/g, '\n')
    ])
    .then((insertComment)=> res.status(201).json(insertComment))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Failed to create comment"})
    })
})

app.get('/api/random-avatar/:gender', async (req, res) => {
    // Extract gender from route params
    const gender = req.params.gender.toLowerCase();

    // Validate gender
    if (!['male', 'female'].includes(gender)) {
        return res.status(400).json({ error: 'Invalid gender. Use "male" or "female".' });
    }

    const avatar = await generateRandomAvatar(gender);

    const avatarBuffer = await sharp(Buffer.from(avatar))
    // .png({ quality: 90, compressionLevel: 9, force: true })  // force PNG format and set transparency
    .toFormat(`${userAvatarFormat}`)
    .toBuffer();

    const avatarBase64 = avatarBuffer.toString('base64');

    res.send({
        format: userAvatarFormat,
        avatar: `data:image/${userAvatarFormat};base64,${avatarBase64}`
    });
});

app.post('/api/user-profile/update', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const avatarBase64 = req.body.avatar_base64.split(',')[1];
        const queryString = `
            UPDATE users SET 
            gender = $1, 
            username = $2, 
            first_name = $3, 
            last_name = $4, 
            phone_number = $5,
            country = $6,
            region = $7,
            relationship_status = $8,
            occupation = $9
            WHERE user_id = ${userId}
        `;
        const queryValues = [
            req.body.gender,
            req.body.username,
            req.body.first_name,
            req.body.last_name,
            req.body.phone_number ?? null,
            req.body.country ?? null,
            req.body.region ?? null,
            req.body.relationship_status ?? null,
            req.body.occupation ?? null
        ];
    
        // Save avatar to file
        const avatarBuffer = Buffer.from(avatarBase64, 'base64');
        const avatarPath = path.join(userAvatarDirPath, `user_avatar_${userId}.${userAvatarFormat}`);
        await sharp(avatarBuffer)
            .toFormat(`${userAvatarFormat}`)
            .toFile(avatarPath);

        // Add user to agolia
        await saveUser({
            objectID: userId,
            user_id: userId,
            username: req.body.username,
        });
    
        // Update user
        await runQuery(queryString, queryValues);
        res.json({ message: 'Profile updated successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
    
})

// Save user profile cover image
app.post('/api/profile-cover-image/store', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const coverBase64 = req.body.cover_base64.split(',')[1];
        const coverBuffer = Buffer.from(coverBase64, 'base64');
        const coverPath = path.join(userProfileCoverImgDirPath, `user_cover_${userId}.${userProfileCoverImgFormat}`);

        // Ensure the directory exists
        if (!fs.existsSync(userProfileCoverImgDirPath)) {
            fs.mkdirSync(userProfileCoverImgDirPath, { recursive: true });
        }

        await sharp(coverBuffer)
            .toFormat(`${userProfileCoverImgFormat}`)
            .toFile(coverPath);
        res.json({ message: 'Cover updated successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update cover' });
    }
})

app.get('/api/user-profile/avatar/:user_id', async (req, res) => {
    const filePath = path.join(userAvatarDirPath, `user_avatar_${req.params.user_id}.${userAvatarFormat}`);
    if(!fs.existsSync(filePath)) return res.status(404).json({message: "Avatar not found"});
    // Set the correct content type for the image
    res.setHeader('Content-Type', `image/${userAvatarFormat}`);
    
    // Stream the image file directly to the response
    fs.createReadStream(filePath).pipe(res);
})

app.get('/api/notifications/:user_id', authenticateToken, async (req, res) => {
    const userId = req.params.user_id;
    const notifications = await getNotifications(userId);
    // const notifications = await runQuery("SELECT * FROM notifications WHERE user_id = $1 ORDER BY notification_id DESC", [userId]);
    // if(notifications.length === 0) return res.status(200).json({message: "No notifications found"});

    // // Get sender avatar
    // notifications.forEach(notification => {
    //     const filePath = path.join(userAvatarDirPath, `user_avatar_${notification.sender_id}.${userAvatarFormat}`);
    //     if(fs.existsSync(filePath)) {
    //         const avatarBuffer = fs.readFileSync(filePath);
    //         const base64avatar = Buffer.from(avatarBuffer).toString('base64');
    //         const avatar = `data:image/${userAvatarFormat};base64,${base64avatar}`;
    //         notification.sender_avatar = avatar;
    //     } 
    // })

    notifications.length === 0 ? res.status(200).json({message: "No notifications found"}) : res.json(notifications);
})

app.delete('/api/notifications/delete/:notification_id', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;
        const notification_id = req.params.notification_id;
        await runQuery("DELETE FROM notifications WHERE user_id = $1 AND notification_id = $2", [user_id, notification_id]);
        res.status(200).json({message: "Notification deleted successfully"});
    } catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to delete notification"});
    }
})

app.get('/api/friend-request/send/:user_id', authenticateToken, async (req, res) => {
    try{
        const friend_id = req.params.user_id;
        const user_id = req.user.user_id;

        // Check if friendship already exists
        const friendship = await runQuery("SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)", [user_id, friend_id]);
        if (friendship.length > 0 && friendship[0].status !== 'rejected') return res.status(400).json({message: "Friendship already exists"});

        if(friendship.length > 0 && friendship[0].status === 'rejected') {
            // Update friendship status
            await runQuery("UPDATE friendships SET status = 'pending', sender_id = $1 WHERE user_id = $2 AND friend_id = $3", [user_id, user_id, friend_id]);
            await runQuery("UPDATE friendships SET status = 'pending', sender_id = $1 WHERE user_id = $2 AND friend_id = $3", [user_id, friend_id, user_id]);
        } else {
            // Create friendship
            await runQuery("INSERT INTO friendships (user_id, friend_id, sender_id, status) VALUES ($1, $2, $3, $4)", [user_id, friend_id, user_id, 'pending']);
            await runQuery("INSERT INTO friendships (user_id, friend_id, sender_id, status) VALUES ($1, $2, $3, $4)", [friend_id, user_id, user_id, 'pending']);
        }
    
        // Create friend request notification
        await runQuery("INSERT INTO notifications (user_id, sender_id, type, content, link) VALUES ($1, $2, $3, $4, $5)" , [
            friend_id,
            user_id,
            "friend_request",
            `${req.user.username} sent you a friend request`,
            `/user/profile/${user_id}`
        ]);
    
        res.status(200).json({message: "Friend request sent successfully"});
    } catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to send friend request"});
    }
})

app.get('/api/friend-request/unsend/:user_id', authenticateToken, async (req, res) => {
    try {
        const friend_id = req.params.user_id;
        const user_id = req.user.user_id;
    
        // Unsend friend request
        await runQuery("DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2", [user_id, friend_id]);
        await runQuery("DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2", [friend_id, user_id]);

        // Delete friend request notification
        await runQuery("DELETE FROM notifications WHERE user_id = $1 AND type = 'friend_request' AND sender_id = $2", [friend_id, user_id]);

        res.status(200).json({message: "Friend request unsend successfully"});
    }
    catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to unsend friend request"});
    }
})

app.get('/api/friend-request/accept/:user_id', authenticateToken, async (req, res) => {
    try {
        const friend_id = req.params.user_id;
        const user_id = req.user.user_id;
    
        // Accept friend request
        await runQuery("UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2", [user_id, friend_id]);
        await runQuery("UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2", [friend_id, user_id]);

        // Delete friend request notification
        await runQuery("DELETE FROM notifications WHERE user_id = $1 AND type = 'friend_request' AND sender_id = $2", [user_id, friend_id]);

        res.status(200).json({message: "Friend request accepted successfully"});
    }
    catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to accept friend request"});
    }
})

app.get('/api/friend-request/reject/:user_id', authenticateToken, async (req, res) => {
    try {
        const friend_id = req.params.user_id;
        const user_id = req.user.user_id;
    
        // Reject friend request
        await runQuery("UPDATE friendships SET status = 'rejected' WHERE user_id = $1 AND friend_id = $2", [user_id, friend_id]);
        await runQuery("UPDATE friendships SET status = 'rejected' WHERE user_id = $1 AND friend_id = $2", [friend_id, user_id]);

        // Delete friend request notification
        await runQuery("DELETE FROM notifications WHERE user_id = $1 AND type = 'friend_request' AND sender_id = $2", [user_id, friend_id]);

        res.status(200).json({message: "Friend request rejected successfully"});
    }
    catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to reject friend request"});
    }
})

app.get('/api/friendship/delete/:user_id', authenticateToken, async (req, res) => {
    try{
        const friend_id = req.params.user_id;
        const user_id = req.user.user_id;
    
        // Delete friendship
        await runQuery("DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2", [user_id, friend_id]);
        await runQuery("DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2", [friend_id, user_id]);

        res.status(200).json({message: "Friendship deleted successfully"});
    } catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to delete friendship"});
    }
})

app.get('/api/friends/:user_id', authenticateToken, async (req, res) => {
    try {
        const user_id = req.params.user_id;
        const friends = await runQuery("SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'", [user_id]);
        const friends_ids = friends.map(friend => friend.friend_id);

        let friendsData = [];
        for(const friend_id of friends_ids) {
            const result = await getUserData(friend_id);
            friendsData.push(result);
        }

        res.status(200).json({friends: friendsData});
    } catch (error) {
        console.log(error);
        res.status(500).json({message: "Failed to get friends"});
    }
})

app.listen(port, () => {
    console.log("listening on port" + port);
});
