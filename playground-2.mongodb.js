// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use("test");

db.users.updateOne(
    {username: "testtest"},
    { $set: {role: "admin"} }
)