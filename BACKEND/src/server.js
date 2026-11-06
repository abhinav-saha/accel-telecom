
require("dotenv").config();

const app = require("./app");
const connectToDB = require("./config/database");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await connectToDB();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer();
