const authUser = (req, res, next) => {
  req.user = {
    _id: "690000000000000000000001",
    username: "testuser",
    email: "test@example.com",
    role: "admin",
  };

  next();
};

module.exports = { authUser };