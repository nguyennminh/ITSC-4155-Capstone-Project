import React, { useState } from 'react';
import { applicants } from '../data/mockData.js';

export default function Recruiter() {
  const [people, setPeople] = useState(applicants);
  const [filter, setFilter] = useState('All');
  function update(id, status) { setPeople(people.map(person => person.id === id ? { ...person, status } : person)); }
  return <section><h1>Applicant dashboard</h1><p>Fictional applicants for the recruiter UI. Not connected to job seeker accounts.</p>
    <label>Filter status<select value={filter} onChange={event => setFilter(event.target.value)}>{['All','New','Shortlisted','Rejected'].map(x => <option key={x}>{x}</option>)}</select></label>
    {people.filter(person => filter === 'All' || person.status === filter).map(person => <article className="card" key={person.id}>
      <h2>{person.name}</h2><p>{person.education}</p><p>{person.experience}</p><p>Skills: {person.skills}</p><span className="badge">{person.status}</span>
      <div className="actions"><button onClick={() => update(person.id, 'Rejected')}>Reject</button><button onClick={() => update(person.id, 'New')}>Reset</button><button className="primary" onClick={() => update(person.id, 'Shortlisted')}>Shortlist</button></div>
    </article>)}
    {!people.some(person => filter === 'All' || person.status === filter) && <p>No applicants in this category.</p>}
  </section>;
}