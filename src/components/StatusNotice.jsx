export default function StatusNotice({ title, children }) {
  return (
    <section className="bg-secundario/30 border border-secundario p-5 rounded-[24px] mb-6">
      <h2 className="font-bold text-texto mb-2">{title}</h2>
      <div className="text-sm text-texto leading-relaxed">{children}</div>
    </section>
  );
}
