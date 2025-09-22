from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Configuration centralisée pour l'application FastAPI."""

    # Configuration ClickHouse
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 9000
    clickhouse_database: str = "tdms_data"
    clickhouse_user: str = "tdms_user"
    clickhouse_password: str = "password"
    
    # Contraintes API
    points_min: int = 10
    points_max: int = 20000
    limit_min: int = 10000
    limit_max: int = 200000
    
    # Valeurs par défaut
    default_points: int = 2000
    default_limit: int = 50000
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Permet de mapper DB_URL -> db_url, POINTS_MIN -> points_min, etc.
        case_sensitive = False

# Instance globale de configuration
settings = Settings()

def get_api_constraints():
    """Retourne les contraintes API pour le frontend."""
    return {
        "points": {
            "min": settings.points_min,
            "max": settings.points_max,
            "default": settings.default_points
        },
        "limit": {
            "min": settings.limit_min,
            "max": settings.limit_max,
            "default": settings.default_limit
        }
    }