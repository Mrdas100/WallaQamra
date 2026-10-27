import LoginForm from "./login-form";

export const metadata = { title: "دخول الموظفين — شاهي قمرا" };

export default function LoginPage() {
  return (
    <main className="wrap stack">
      <div className="brandbar">
        <img src="/icon-192.png" alt="" />
        <h1>دخول الموظفين</h1>
      </div>
      <section className="panel">
        <LoginForm />
      </section>
    </main>
  );
}
