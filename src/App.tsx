import PublicBooking from "./PublicBooking";
import AdminPortal from "./AdminPortal";
import ManageBooking from "./ManageBooking";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <AdminPortal />;
  if (path.startsWith("/booking/")) return <ManageBooking />;
  return <PublicBooking />;
}
