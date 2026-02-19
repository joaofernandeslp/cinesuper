export default function Container({ children, className = "" }) {
  return (
    <div className={`w-full px-4 sm:px-6 lg:px-10 2xl:px-14 ${className}`}>
      {children}
    </div>
  );
}
