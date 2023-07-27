const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const Credential = require('./Credential.json');

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.set('strictQuery', true);
mongoose
    .connect('Add Your MongoDB String Here', {   //  put your mongoDB string
        useNewUrlParser: true,
    })
    .then(() => console.log('MongoDb is connected'))
    .catch((err) => console.log(err));

const userSchema = new mongoose.Schema({
    googleDriveToken: String,
    Date:String
});
const User = mongoose.model('User', userSchema);
const date = new Date();
const ISTOffset = 330; 
const offset = ISTOffset * 60 * 1000;
const ISTTime = new Date(date.getTime() + offset);


const ChangeTime = new Date(ISTTime);
const IndianTime = new Date(ChangeTime.getTime()).toISOString()

const CLIENT_ID = Credential.web.client_id;
const CLIENT_SECRET = Credential.web.client_secret;
const REDIRECT_URI = Credential.web.redirect_uris;
const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI[0]);


app.get('/auth', (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive'],
        include_granted_scopes: true,
    });
    res.redirect(authUrl);
});


app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        console.log('Access token:', tokens.access_token);
        const newUser = new User({ googleDriveToken: tokens.access_token,Date:IndianTime });
        await newUser.save();

        res.status(200).send({ message: 'Access token saved successfully', tokens });
    } catch (error) {
        console.error('Error fetching access token:', error);
        res.status(500).json({ error: 'Failed to fetch access token' });
    }
});

const getAnalytics = async (accessToken) => {
    oAuth2Client.setCredentials({ access_token: accessToken });

    try {
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        const fileSizes = await drive.files.list({
            fields: 'files(size)',
        });
        const fileNames = await drive.files.list({
            fields: 'files(name)',
        });

        const driveInfo = await drive.about.get({
            fields: 'storageQuota',
        });

        const sharingInfo = await drive.permissions.list({
            fileId: 'root',
        });

        const peopleWithAccess = new Set();
        sharingInfo.data.permissions.forEach((permission) => {
            if (permission.emailAddress && permission.emailAddress !== 'default') {
                peopleWithAccess.add(permission.emailAddress);
            }
        });

        const publicFiles = fileSizes.data.files.filter((file) => file.size === undefined);

        console.log('File sizes:', fileSizes.data.files);
        console.log('Drive size:', driveInfo.data.storageQuota);
        console.log('Number of people with access:', peopleWithAccess.size);
        console.log('Count of public files:', publicFiles.length);

        const filesData = fileSizes.data.files.map((file, index) => {
            return {
                name: fileNames.data.files[index].name,
                size: file.size,
            };
        });

        return {
            filesData,
            driveSize: driveInfo.data.storageQuota,
            peopleWithAccess: peopleWithAccess.size,
            publicFilesCount: publicFiles.length,
        };
    } catch (error) {
        console.error('Error fetching Google Drive analytics:', error.message);
        throw error;
    }
};




app.get('/analytics', async (req, res) => {
    const accessToken = req.query.accessToken;

    try {
        const analytics = await getAnalytics(accessToken);
        res.status(200).send({ data: analytics, status: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Google Drive analytics' });
    }
});



const revokeDriveAccess = async (accessToken) => {
    try {
        oAuth2Client.setCredentials({ access_token: accessToken });
        await oAuth2Client.revokeToken(accessToken);
        console.log('Google Drive access revoked successfully.');
    } catch (error) {
        res.status(500).json({ error: 'Error In Google Drive access revoked' });
    }
};


app.get('/revoke-access', async (req, res) => {
    const accessToken = req.query.accessToken;
    await revokeDriveAccess(accessToken);
    res.status(200).send({ message: 'Google Drive access revoked successfully.', status: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
