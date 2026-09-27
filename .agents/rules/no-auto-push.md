# Regla de Oro: Prohibido hacer Push a Remoto sin Orden Explícita

1. **Nunca ejecutar `git push`**:
   - Bajo ninguna circunstancia se debe ejecutar `git push`, ni empujar ramas ni tags (`git push origin <tag>`) al repositorio remoto (GitHub/GitLab) a menos que el usuario lo solicite expresamente en su mensaje con palabras textuales (por ejemplo: *"sube a github"*, *"haz push"*, *"publica la versión en github"*).
2. **Probar antes de subir**:
   - Todos los commits, compilaciones y cambios deben permanecer **estrictamente locales** para que el usuario pueda probar y verificar en su máquina antes de tomar la decisión de publicar.
3. **No asumir permisos**:
   - Aunque una tarea incluya crear un release o arreglar un bug, el push debe ser explícitamente confirmado o pedido por el usuario.
