interface BoundsAlert {
  message: string;
  type: 'min' | 'max';
  timestamp: number;
}

interface BoundsAlertProps {
  alert: BoundsAlert | null;
}

export default function BoundsAlert({ alert }: BoundsAlertProps) {
  if (!alert) return null;

  return (
    <>
      <div style={{
        position: "absolute",
        top: 50,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1001,
        padding: "8px 16px",
        backgroundColor: alert.type === 'min' ? "#f44336" : "#ff9800",
        color: "white",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 500,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.2)",
        animation: "fadeIn 0.3s ease-out"
      }}>
        ⚠️ {alert.message}
      </div>

      {/* CSS Animation pour l'alerte */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </>
  );
}