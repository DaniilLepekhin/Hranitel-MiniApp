#!/bin/bash
echo "Checking backend status..."
curl -s https://hranitel.daniillepekhin.com/api/health || echo "Backend is down"
