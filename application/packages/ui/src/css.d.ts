/** CSS Modules are compiled by the consuming Next.js app (transpilePackages). */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
