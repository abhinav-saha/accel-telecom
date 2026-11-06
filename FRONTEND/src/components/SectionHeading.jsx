function SectionHeading({ title, subtitle, id }) {
  return (
    <div className="section-heading" id={id}>
      <h2 className="section-heading__title">{title}</h2>
      {subtitle && <p className="section-heading__subtitle">{subtitle}</p>}
    </div>
  );
}

export default SectionHeading;
