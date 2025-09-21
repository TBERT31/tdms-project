interface LoadingOverlayProps {
  isLoading: boolean;
}

export default function LoadingOverlay({ isLoading }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(255,255,255,0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999,
      borderRadius: "4px"
    }}>
      <div style={{ 
        padding: "12px 20px", 
        backgroundColor: "#333", 
        color: "white", 
        borderRadius: "4px",
        fontSize: "14px"
      }}>
        Rechargement des données...
      </div>
    </div>
  );
}