# Installation requise: pip install lttb

import lttb
import numpy as np
import pandas as pd

def downsample_with_lttb(df: pd.DataFrame, target_points: int) -> pd.DataFrame:
    """
    Utilise la librairie lttb officielle, testée et éprouvée.
    """
    if len(df) <= target_points:
        return df
    
    # Préparer les données au format attendu par lttb
    # Format: array 2D avec [temps, valeurs]
    if 'time' in df.columns and 'value' in df.columns:
        
        # Convertir les timestamps datetime en float si nécessaire
        time_values = df['time'].values
        if pd.api.types.is_datetime64_any_dtype(df['time']):
            # Convertir en timestamps Unix (secondes)
            time_values = pd.to_datetime(df['time']).astype('int64') / 1e9
        else:
            time_values = time_values.astype(float)
        
        # Créer le tableau 2D requis par lttb
        data_array = np.column_stack([
            time_values,
            df['value'].astype(float).values
        ])
        
        # Appliquer LTTB
        downsampled = lttb.downsample(data_array, n_out=target_points)
        
        # Reconstruire le DataFrame
        result_df = pd.DataFrame({
            'time': downsampled[:, 0],
            'value': downsampled[:, 1]
        })
        
        # Reconvertir les timestamps si nécessaire
        if pd.api.types.is_datetime64_any_dtype(df['time']):
            result_df['time'] = pd.to_datetime(result_df['time'], unit='s')
        else:
            result_df['time'] = result_df['time'].astype(df['time'].dtype)
            
        return result_df
    
    else:
        raise ValueError("DataFrame doit avoir les colonnes 'time' et 'value'")


# Version alternative avec lttbc (plus rapide pour de gros volumes)
def downsample_with_lttbc(df: pd.DataFrame, target_points: int) -> pd.DataFrame:
    """
    Version ultra-rapide avec lttbc (extension C)
    Installation: pip install lttbc
    """
    try:
        import lttbc
    except ImportError:
        raise ImportError("pip install lttbc")
    
    if len(df) <= target_points:
        return df
    
    # Même logique mais avec lttbc
    time_values = df['time'].values
    if pd.api.types.is_datetime64_any_dtype(df['time']):
        time_values = pd.to_datetime(df['time']).astype('int64') / 1e9
    else:
        time_values = time_values.astype(float)
    
    # lttbc prend des arrays séparés (plus rapide)
    downsampled_indices = lttbc.downsample(
        time_values, 
        df['value'].astype(float).values, 
        target_points
    )
    
    return df.iloc[downsampled_indices].copy()


# Fonction wrapper pour ton endpoint
def smart_downsample_production(df: pd.DataFrame, target_points: int, prefer_speed: bool = False) -> pd.DataFrame:
    """
    Downsampling production avec librairies éprouvées
    
    Args:
        df: DataFrame avec colonnes 'time' et 'value'
        target_points: nombre de points cibles
        prefer_speed: True = utilise lttbc (plus rapide), False = utilise lttb (plus stable)
    """
    if prefer_speed:
        try:
            return downsample_with_lttbc(df, target_points)
        except ImportError:
            print("lttbc non installé, utilisation de lttb standard")
            return downsample_with_lttb(df, target_points)
    else:
        return downsample_with_lttb(df, target_points)