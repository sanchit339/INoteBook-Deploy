import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';

const Signup = ({ showAlert }) => {
  const [credential, setCredential] = useState({ name: '', email: '', password: '', cpassword: '' });
  const backendUrl = getApiBase();

  const history = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (credential.password !== credential.cpassword) {
      showAlert('Passwords do not match', 'danger');
      return;
    }

    const response = await fetch(`${backendUrl}/api/auth/createUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: credential.name,
        email: credential.email,
        password: credential.password,
      }),
    });

    const json = await response.json();
    if (json.success) {
      localStorage.setItem('token', json.authtoken);
      showAlert('Account created successfully', 'success');
      history('/');
    } else {
      showAlert(json.error || 'Unable to create account', 'danger');
    }
  };

  const onChange = (event) => {
    setCredential({ ...credential, [event.target.name]: event.target.value });
  };

  return (
    <section className="auth-layout">
      <article className="card auth-card">
        <p className="home-kicker">Get started</p>
        <h2>Create your workspace</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name">Name</label>
            <input type="text" id="name" name="name" onChange={onChange} placeholder="Your name" required />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input type="email" id="email" name="email" onChange={onChange} placeholder="you@example.com" required />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              onChange={onChange}
              placeholder="At least 5 characters"
              minLength={5}
              required
            />
          </div>
          <div>
            <label htmlFor="cpassword">Confirm Password</label>
            <input
              type="password"
              id="cpassword"
              name="cpassword"
              onChange={onChange}
              placeholder="Repeat password"
              minLength={5}
              required
            />
          </div>
          <button type="submit" className="btn-primary">Create account</button>
        </form>
        <p className="auth-foot">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </article>
    </section>
  );
};

export default Signup;
