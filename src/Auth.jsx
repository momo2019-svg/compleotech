// src/Auth.jsx
import { useState } from "react";
import { supabase } from "./lib/supabase.js";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignup = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Check your email to confirm your account!");
    setLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "You are logged in!");
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto", textAlign: "center" }}>
      <h2>Compleotech Login / Signup</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", margin: "10px auto", padding: 10, width: "100%" }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", margin: "10px auto", padding: 10, width: "100%" }}
      />
      <button onClick={handleSignup} disabled={loading} style={{ margin: 10 }}>
        Sign Up
      </button>
      <button onClick={handleLogin} disabled={loading} style={{ margin: 10 }}>
        Log In
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
