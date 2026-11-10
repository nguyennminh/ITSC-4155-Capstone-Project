import React from 'react';

export default function PageHeader({ title, subtitle }) {
  return <header className="page-header">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
  </header>;
}
