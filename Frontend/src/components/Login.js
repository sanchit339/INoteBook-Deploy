import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Login = ({ showAlert }) => {
  const [credential, setCredential] = useState({ email: '', password: '' });
  const backendUrl =
    process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:4001';

  const history = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: credential.email, password: credential.password }),
    });

    const json = await response.json();
    if (json.success) {
      localStorage.setItem('token', json.authtoken);
      showAlert('Logged in successfully', 'success');
      history('/');
    } else {
      showAlert('Invalid credentials', 'danger');
    }
  };

  const onChange = (event) => {
    setCredential({ ...credential, [event.target.name]: event.target.value });
  };

  return (
    <section className="auth-layout">
      <article className="card auth-card">
        <p className="home-kicker">Welcome back</p>
        <h2>Sign in to CloudNote</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={credential.email}
              name="email"
              onChange={onChange}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={credential.password}
              onChange={onChange}
              name="password"
              placeholder="Enter password"
              required
            />
          </div>
          <button type="submit" className="btn-primary">Sign in</button>
        </form>
        <p className="auth-foot">
          New here? <Link to="/signup">Create your account</Link>
        </p>
      </article>
    </section>
  );
};

export default Login;
