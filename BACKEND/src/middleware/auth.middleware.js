// Temporary demo identity while customer authentication is intentionally deferred.
// Admin endpoints do NOT use this middleware; they use the separate Admin/JWT flow.
const authUser = (req, res, next) => {
  req.user = {
    _id: "690000000000000000000001",
    username: "testuser",
    email: "test@example.com",
    role: "customer",
  };
  next();
};

module.exports = { authUser };
