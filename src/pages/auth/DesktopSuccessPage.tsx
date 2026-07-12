import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Legacy route — redirect to the device-code linking page. */
export default function DesktopSuccessPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/auth/desktop-device", { replace: true });
  }, [navigate]);
  return null;
}
