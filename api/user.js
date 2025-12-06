/**
 * NeoClip Production - User Management API
 * Create and manage user accounts
 * 
 * SECURITY: All sensitive keys are stored in Vercel Environment Variables
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const getSupabaseClient = () => {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
};

// Generate UUID v4
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabaseClient();

  try {
    // POST - Create new user
    if (req.method === 'POST') {
      const { deviceId, email } = req.body;

      // Check if user already exists by deviceId
      if (deviceId) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('device_id', deviceId)
          .single();

        if (existingUser) {
          return res.status(200).json({
            success: true,
            user: existingUser,
            message: 'Existing user found'
          });
        }
      }

      // Create new user
      const userId = generateUUID();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);

      const newUser = {
        id: userId,
        device_id: deviceId || null,
        email: email || null,
        tier: 'free',
        free_used: 0,
        resets_at: nextMonth.toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };

      const { data: user, error } = await supabase
        .from('users')
        .insert(newUser)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create user: ${error.message}`);
      }

      return res.status(201).json({
        success: true,
        user,
        message: 'User created successfully'
      });
    }

    // GET - Get user info
    if (req.method === 'GET') {
      const { userId, deviceId } = req.query;

      if (!userId && !deviceId) {
        return res.status(400).json({ 
          error: 'userId or deviceId is required' 
        });
      }

      let query = supabase.from('users').select('*');
      
      if (userId) {
        query = query.eq('id', userId);
      } else {
        query = query.eq('device_id', deviceId);
      }

      const { data: user, error } = await query.single();

      if (error || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Calculate remaining days until reset
      const resetsAt = new Date(user.resets_at);
      const now = new Date();
      const daysUntilReset = Math.ceil((resetsAt - now) / (1000 * 60 * 60 * 24));

      return res.status(200).json({
        success: true,
        user: {
          ...user,
          freeRemaining: 10 - user.free_used,
          daysUntilReset: Math.max(0, daysUntilReset)
        }
      });
    }

    // PATCH - Update user (upgrade tier, etc.)
    if (req.method === 'PATCH') {
      const { userId, tier, email } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const updateData = {};
      if (tier) updateData.tier = tier;
      if (email) updateData.email = email;
      updateData.updated_at = new Date().toISOString();

      const { data: user, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user: ${error.message}`);
      }

      return res.status(200).json({
        success: true,
        user,
        message: 'User updated successfully'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('User API error:', error);
    return res.status(500).json({ 
      error: 'Operation failed',
      message: error.message 
    });
  }
}
