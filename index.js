import express from "express"
import bodyParser from "body-parser"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"
import databaseSetup, { runQuery } from "./databaseSetup.js"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { authenticateToken, isUserAuthorized } from "./middleware/auth.js"
import { __dirname, userAvatarDirPath, userAvatarFormat } from "./config.js"

// Connect to the database
const db = await databaseSetup();

const app = express();
app.use(express.json({ limit: '10mb' })); // Increase JSON payload size
const port = process.env.PORT || 4000;
const jwtSecret = '1283fc47b7cd439a7f8e36e614a41fe519be35088befd42bc2fdf7130a646e9a75685b';
let user = [];
let posts = [];
let likes = [];
let comments = [];

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
async function generateRandomAvatar(gender) {
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
    res.locals.routeName = "user.profile";
    const relatedUsersId = [];
    const relatedUsers = [];
    const foundUser = await runQuery("SELECT * FROM users WHERE user_id = $1", [req.params.user_id]);
    foundUser[0].password = undefined;
    foundUser[0].accountName = undefined;

    // Get user avatar
    const filePath = path.join(userAvatarDirPath, `user_avatar_${foundUser[0].user_id}.${userAvatarFormat}`);
    if(!fs.existsSync(filePath)) return;
    const avatarBuffer = fs.readFileSync(filePath);
    const base64avatar = Buffer.from(avatarBuffer).toString('base64');
    const avatar = `data:image/${userAvatarFormat};base64,${base64avatar}`
    foundUser[0].avatar = avatar;

    // Get all posts from user
    const userPosts = await runQuery("SELECT * FROM posts WHERE user_id = $1 ORDER BY post_id DESC", [req.params.user_id]);

    // Add users id related to userPosts
    if(userPosts) {
        for(const post of userPosts) {
            // Add liked users
            const likedUsers = await runQuery("SELECT * FROM likes WHERE post_id = $1", [post.post_id]);
            post.likedUsers = likedUsers;
    
            // Add total comments
            const totalComments = await runQuery("SELECT COUNT(*) FROM comments WHERE post_id = $1", [post.post_id]);
            post.totalComments = totalComments.length;
    
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
                const totalComments = await runQuery("SELECT COUNT(*) FROM comments WHERE post_id = $1", [post.post_id]);
                post.totalComments = totalComments.length;
        
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
        const insertedRow = await runQuery("INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [
            nextUserId,
            req.body.accountName, 
            req.body.Gender,
            req.body.Username, 
            hashedPassword,
            req.body.firstName,
            req.body.lastName
        ])

        // Generate a JWT
        const maxAge = 3 * 60 * 60;
        const token = jwt.sign(
            {userid: insertedRow[0].user_id, username: insertedRow[0].username},
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
            {userid: foundUser[0].user_id, username: foundUser[0].username},
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
        req.body.content,
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
        res.status(500).json({message: "Update unsuccessul: " + error});
    })
})

app.post('/delete-post',(req,res) =>{
    runQuery("DELETE FROM posts WHERE post_id = $1" , [req.body.postId])
    .then(()=> res.status(201).json({message: "Delete successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete failed: " + error})
    })
})

app.post('/like-post',async (req,res)=> {
    const result = await runQuery("SELECT like_id FROM likes ORDER BY like_id DESC LIMIT 1");

    runQuery("INSERT INTO likes VALUES($1,$2,$3)" , [
        result[0] ? result[0].like_id + 1 : 1,
        req.body.userId,
        req.body.postId
    ])
    .then(()=> res.status(201).json({message: "Like post successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Like post failed: " + error})
    })
})

app.post('/delete-like-post',(req,res)=> {

    runQuery("DELETE FROM likes WHERE post_id = $1 AND user_id = $2" , [req.body.postId, req.body.userId])
    .then(()=> res.status(201).json({message: "Delete like post successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete like post failed: " + error})
    })
})

app.post('/create-comment', async (req,res)=> {

    const commentId = await runQuery("SELECT comment_id FROM comments ORDER BY comment_id DESC LIMIT 1");

    runQuery("INSERT INTO comments VALUES ($1,$2,$3,$4,$5)",[
        commentId[0] ? commentId[0].comment_id + 1 : 1,
        req.body.postId,
        req.body.userId,
        req.body.username,
        req.body.content
    ])
    .then(()=> res.status(201).json({message: "comment created successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Failed to create comment: " + error})
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
        const userId = req.user.userid;
        const avatarBase64 = req.body.avatar_base64.split(',')[1];
        const queryString = `UPDATE users SET gender = $1, username = $2, first_name = $3, last_name = $4 WHERE user_id = ${userId}`;
        const queryValues = [
            req.body.gender,
            req.body.username,
            req.body.first_name,
            req.body.last_name,
        ];
    
        // Save avatar to file
        const avatarBuffer = Buffer.from(avatarBase64, 'base64');
        const avatarPath = path.join(userAvatarDirPath, `user_avatar_${userId}.${userAvatarFormat}`);
        await sharp(avatarBuffer)
            .toFormat(`${userAvatarFormat}`)
            .toFile(avatarPath);
    
        // Update user
        await runQuery(queryString, queryValues);
        res.json({ message: 'Profile updated successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
    
})

app.listen(port, () => {
    console.log("listening on port" + port);
});
