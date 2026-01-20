import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom';

const Signup = (props) => {

  const [credentail, setCredentail] = useState({ name: "", email: "", password: "", cpassword: "" })
  const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:4001";

  let history = useNavigate();

  const handleSubmit = async (eve) => {
    eve.preventDefault();
    // API call without destructuring since variables were unused
    const response = await fetch(`${backendUrl}/api/auth/createUser`, {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: credentail.name, email: credentail.email, password: credentail.password })
    });
    const json = await response.json();
    console.log(json);
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
    <div className='container mt-3'>
      <h2>SignUp to Notable</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input type="text" className="form-control" id="name" aria-describedby="emailHelp" name='name' onChange={onChange} placeholder="Enter Name" />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email address</label>
          <input type="email" className="form-control" id="email" aria-describedby="emailHelp" name='email' onChange={onChange} placeholder="Enter email" />
          <small id="emailHelp" className="form-text text-muted">We'll never share your email with anyone else.</small>
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input type="password" className="form-control" id="password" name='password' onChange={onChange} placeholder="Password" minLength={5} required />
        </div>
        <div className="form-group">
          <label htmlFor="cpassword">Conform Password</label>
          <input type="password" className="form-control" id="cpassword" name='cpassword' onChange={onChange} placeholder="Password" minLength={5} required />
        </div>
        <button type="submit" className="btn btn-primary my-2">Submit</button>
      </form>
    </div>
  )
}

export default Signup
