// ============================================
// Redis Helper - Shared User Management - FIXED
// ============================================

const { createClient } = require("redis");

class RedisUserManager {
    constructor() {
        this.client = createClient({
            url: "redis://localhost:6379"
        });
        
        this.client.on("error", (err) => {
            console.error("❌ Redis Client Error:", err);
        });
        
        this.connected = false;
        this.connect();
    }
    
    async connect() {
        try {
            await this.client.connect();
            this.connected = true;
            console.log("✅ Redis User Manager connected");
            
            // Initialize users set if it doesn't exist
            const exists = await this.client.exists('chat:users');
            if (!exists) {
                // Create empty set
                await this.client.sAdd('chat:users', 'dummy');
                await this.client.sRem('chat:users', 'dummy');
                console.log("📁 Initialized chat:users set in Redis");
            }
        } catch (error) {
            console.error("❌ Redis connection error:", error);
            this.connected = false;
        }
    }
    
    // Get all users
    async getUsers() {
        try {
            if (!this.connected) {
                console.warn("⚠️ Redis not connected, returning empty user list");
                return [];
            }
            const users = await this.client.sMembers('chat:users');
            return users || [];
        } catch (error) {
            console.error('❌ Error getting users:', error);
            return [];
        }
    }
    
    // Add a user
    async addUser(username) {
        try {
            if (!username) return await this.getUsers();
            if (!this.connected) {
                console.warn("⚠️ Redis not connected, cannot add user");
                return [username]; // Return just this user as fallback
            }
            
            await this.client.sAdd('chat:users', username);
            console.log(`✅ User added to Redis: ${username}`);
            return await this.getUsers();
        } catch (error) {
            console.error('❌ Error adding user:', error);
            return [];
        }
    }
    
    // Remove a user
    async removeUser(username) {
        try {
            if (!username) return await this.getUsers();
            if (!this.connected) {
                console.warn("⚠️ Redis not connected, cannot remove user");
                return [];
            }
            
            await this.client.sRem('chat:users', username);
            console.log(`✅ User removed from Redis: ${username}`);
            return await this.getUsers();
        } catch (error) {
            console.error('❌ Error removing user:', error);
            return [];
        }
    }
    
    // Check if user exists
    async userExists(username) {
        try {
            if (!username) return false;
            if (!this.connected) return false;
            
            return await this.client.sIsMember('chat:users', username);
        } catch (error) {
            console.error('❌ Error checking user:', error);
            return false;
        }
    }
    
    // Clear all users (for testing)
    async clearAllUsers() {
        try {
            if (!this.connected) return [];
            
            await this.client.del('chat:users');
            console.log("🧹 Cleared all users from Redis");
            return [];
        } catch (error) {
            console.error('❌ Error clearing users:', error);
            return [];
        }
    }
}

// Create a singleton instance
const redisUserManager = new RedisUserManager();

module.exports = redisUserManager;