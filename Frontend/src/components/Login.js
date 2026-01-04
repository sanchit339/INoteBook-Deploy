import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom';

const Login = (props) => {
    // make the use of useState Hook
    const [credentail, setCredentail] = useState({ email: "", password: "" })
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:4001";

    let history = useNavigate();

    const handleSubmit = async (eve) => {
        eve.preventDefault();
        const response = await fetch(`${backendUrl}/api/auth/login`, {
            method: 'POST', // *GET, POST, PUT, DELETE, etc.
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: credentail.email, password: credentail.password })
        });
        const json = await response.json();
        //   console.log(json);
        // save the auth token and redirect (if success) 
        if (json.success) {
            localStorage.setItem('token', json.authtoken);  // here we are saving the token in DB
            props.showAlert("Account Created SuccessFully", "success")
            // to redirect we use use history hook
            history("/");
        } else {
            props.showAlert("Invalid Credential", "danger")
        }

    }

    const onChange = (eve) => { //event 
        setCredentail({ ...credentail, [eve.target.name]: eve.target.value })  // change the note of the name -- value of the note 
    }
    return (
        <div className='mt-3'>
            <h2>Login to continue to Notable</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="email">Email address</label>
                    <input type="email" className="form-control" id="email" value={credentail.email} name='email' onChange={onChange} aria-describedby="emailHelp" placeholder="Enter email" />
                    <small id="emailHelp" className="form-text text-muted">We'll never share your email with anyone else.</small>
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input type="password" className="form-control" id="password" value={credentail.password} onChange={onChange} name='password' placeholder="Password" />
                </div>
                <button type="submit" className="btn btn-primary my-2" >Submit</button>
            </form>
        </div>
    )
}

export default Login
