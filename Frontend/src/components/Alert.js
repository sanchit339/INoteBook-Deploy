import React from 'react';

export default function Alert({ alert }) {
  if (!alert) {
    return <div className="alert-shell" />;
  }

  return (
    <div className="alert-shell">
      <div className={`alert-chip ${alert.type === 'danger' ? 'is-danger' : 'is-success'}`}>
        <strong>{alert.type === 'danger' ? 'Error' : 'Success'}</strong>
        <span>{alert.msg}</span>
      </div>
    </div>
  );
}
